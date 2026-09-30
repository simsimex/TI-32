// =============================================================================
//   TI-32 FIRMWARE v3.20-OV5640 (chat + firmware word-wrap) ///
//   - Camera enabled (XIAO ESP32-S3 Sense, OV2640)
//   - Wired D0=TIP, D2=RING (video-2 layout)
//   - Forces clean WiFi reconnect, prints actual SSID, 15s timeout
//   - POSTs JPEG to /gpt/snap and /gpt/solve, image/jpeg content-type
// =============================================================================
// Project: TI-32 (chromalock base, modified)
// Date:    2026

#include "./secrets.h"
#include "./launcher.h"   // CAMERA program blob, pushed by command 5
#include <TICL.h>
#include <CBL2.h>
#include <TIVar.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <UrlEncode.h>
#include <Preferences.h>

// ---- Camera enabled for XIAO ESP32-S3 Sense ----
#define CAMERA

#ifdef CAMERA
#include <esp_camera.h>
#define CAMERA_MODEL_XIAO_ESP32S3
#include "./camera_pins.h"
#include "./camera_index.h"
// OV5640 autofocus. The OV5640 module is a VCM (voice-coil) autofocus part;
// its focus motor is driven by firmware that must be uploaded to the sensor
// after every power-up. Without it the lens sits at its default,
// out-of-focus position. Library: "OV5640 Auto Focus for ESP32 Camera"
// (github.com/0015/ESP32-OV5640-AF), installed in Arduino/libraries.
#include "ESP32_OV5640_AF.h"
#endif

// Video-2 wiring (no PCB, hand-soldered): D0 = TIP, D2 = RING.
// Original chromalock PCB wiring was D1/D10. Change these if you ever rewire.
constexpr auto TIP = D0;
constexpr auto RING = D2;
constexpr auto MAXHDRLEN = 16;
constexpr auto MAXDATALEN = 4096;
constexpr auto MAXARGS = 5;
constexpr auto MAXSTRARGLEN = 256;
constexpr auto PICSIZE = 756;
constexpr auto PICVARSIZE = PICSIZE + 2;
constexpr auto PASSWORD = 69;

CBL2 cbl;
Preferences prefs;

// whether or not the user has entered the password
bool unlocked = false;

// Arguments
int currentArg = 0;
char strArgs[MAXARGS][MAXSTRARGLEN];
double realArgs[MAXARGS];

// the command to execute
int command = -1;
// whether or not the operation has completed
bool status = 0;
// whether or not the operation failed
bool error = 0;
// error or success message
char message[MAXSTRARGLEN];
// list data
constexpr auto LISTLEN = 256;
constexpr auto LISTENTRYLEN = 20;
char list[LISTLEN][LISTENTRYLEN];
// http response
constexpr auto MAXHTTPRESPONSELEN = 4096;
char response[MAXHTTPRESPONSELEN];
// image variable (96x63)
uint8_t frame[PICVARSIZE] = {PICSIZE & 0xff, PICSIZE >> 8};
String fullResponse;
// TI-84 Plus home screen is 96x64 px = 16 chars wide x 8 rows.
// CAMERA uses rows 1-6 for text and row 8 for the nav hint, so one page is
// 6 rows x 16 cols = 96 chars. The server word-wraps and pads every line to
// exactly 16 chars, so slicing at a multiple of 16 lands on a row boundary.
const int PAGE_SIZE = 96;
int PAGE_PAGE = 0; 

void connect();
void disconnect();
void gpt();
void send();
void launcher();
void snap();
void solve();
void image_list();
void fetch_image();
void fetch_chats();
void send_chat();
void program_list();
void fetch_program();
void sendPage();
void reply();
void clearChat(); 
void chat();
String wrapForCalc(const String &in);

struct Command
{
  int id;
  const char *name;
  int num_args;
  void (*command_fp)();
  bool wifi;
};

struct Command commands[] = {
    {0, "connect", 0, connect, false},
    {1, "disconnect", 0, disconnect, false},
    {2, "gpt", 1, gpt, true},
    {4, "send", 2, send, true},
    {5, "launcher", 0, launcher, false},
    {7, "snap", 0, snap, false},
    {8, "solve", 1, solve, true},
    {9, "image_list", 1, image_list, true},
    {10, "fetch_image", 1, fetch_image, true},
    {11, "fetch_chats", 2, fetch_chats, true},
    {12, "send_chat", 2, send_chat, true},
    {13, "program_list", 1, program_list, true},
    {14, "fetch_program", 1, fetch_program, true},
    { 15, "sendPage", 1, sendPage, true },
    { 16, "reply", 1, reply, true },
    { 17, "clearChat", 1, clearChat, true}, 
    { 18, "chat", 1, chat, true },        // follow-up question about the last photo
};

constexpr int NUMCOMMANDS = sizeof(commands) / sizeof(struct Command);
// Bumped from 14 -> 17 so commands sendPage(15), reply(16), clearChat(17) are
// actually dispatched by loop(). The camera commands snap(7) and solve(8) are
// already <= 14, but enabling everything keeps the launcher/UI features working.
constexpr int MAXCOMMAND = 18;

uint8_t header[MAXHDRLEN];
uint8_t data[MAXDATALEN];

// lowercase letters make strings weird,
// so we have to truncate the string
void fixStrVar(char *str)
{
  int end = strlen(str);
  for (int i = 0; i < end; ++i)
  {
    if (isLowerCase(str[i]))
    {
      --end;
    }
  }
  str[end] = '\0';
}

int onReceived(uint8_t type, enum Endpoint model, int datalen);
int onRequest(uint8_t type, enum Endpoint model, int *headerlen,
              int *datalen, data_callback *data_callback);

void startCommand(int cmd)
{
  command = cmd;
  status = 0;
  error = 0;
  currentArg = 0;
  for (int i = 0; i < MAXARGS; ++i)
  {
    memset(&strArgs[i], 0, MAXSTRARGLEN);
    realArgs[i] = 0;
  }
  strncpy(message, "no command", MAXSTRARGLEN);
}

void setError(const char *err)
{
  Serial.print("ERROR: ");
  Serial.println(err);
  error = 1;
  status = 1;
  command = -1;
  strncpy(message, err, MAXSTRARGLEN);
}

void setSuccess(const char *success)
{
  Serial.print("SUCCESS: ");
  Serial.println(success);
  error = 0;
  status = 1;
  command = -1;
  strncpy(message, success, MAXSTRARGLEN);
}

int sendProgramVariable(const char *name, uint8_t *program, size_t variableSize);

bool camera_sign = false;

#ifdef CAMERA
// ---------------------------------------------------------------------------
//  COLD-CAPTURE CAMERA MANAGEMENT
//
//  The OV5640 on the XIAO Sense expansion board has a documented hardware
//  defect: the board's DVDD regulator outputs 1V3 where the sensor needs
//  1V8+, so the sensor falls back to its own internal regulator, which
//  dissipates ~127mW inside the sensor package. Within ~5 seconds of
//  streaming the image goes dark and develops a purple haze.
//
//  Mitigation: keep the sensor powered DOWN except during an actual capture,
//  and capture quickly once it's up. Stays inside the thermal budget.
//  See: forum.arduino.cc/t/ov5640-solution-for-overheating/1420017
// ---------------------------------------------------------------------------
camera_config_t ti32_cam_config;
bool camera_running = false;
OV5640 ti32_af = OV5640();
bool af_ready = false;   // true once AF firmware is loaded this power cycle

void buildCameraConfig()
{
  ti32_cam_config.ledc_channel = LEDC_CHANNEL_0;
  ti32_cam_config.ledc_timer = LEDC_TIMER_0;
  ti32_cam_config.pin_d0 = Y2_GPIO_NUM;
  ti32_cam_config.pin_d1 = Y3_GPIO_NUM;
  ti32_cam_config.pin_d2 = Y4_GPIO_NUM;
  ti32_cam_config.pin_d3 = Y5_GPIO_NUM;
  ti32_cam_config.pin_d4 = Y6_GPIO_NUM;
  ti32_cam_config.pin_d5 = Y7_GPIO_NUM;
  ti32_cam_config.pin_d6 = Y8_GPIO_NUM;
  ti32_cam_config.pin_d7 = Y9_GPIO_NUM;
  ti32_cam_config.pin_xclk = XCLK_GPIO_NUM;
  ti32_cam_config.pin_pclk = PCLK_GPIO_NUM;
  ti32_cam_config.pin_vsync = VSYNC_GPIO_NUM;
  ti32_cam_config.pin_href = HREF_GPIO_NUM;
  ti32_cam_config.pin_sscb_sda = SIOD_GPIO_NUM;
  ti32_cam_config.pin_sscb_scl = SIOC_GPIO_NUM;
  ti32_cam_config.pin_pwdn = PWDN_GPIO_NUM;
  ti32_cam_config.pin_reset = RESET_GPIO_NUM;
  // 20 MHz: the reference XCLK the esp32-camera OV5640 driver and Seeed's
  // examples are tuned for. (Heat is handled by cold-capture plus the
  // 0x302C output-drive fix in cameraPowerUp, not by underclocking.)
  ti32_cam_config.xclk_freq_hz = 20000000;
  // SXGA (1280x1024). Seeed's official OV5640 AF examples run AF at SXGA,
  // so capturing at the same size means no framesize switch after focusing.
  ti32_cam_config.frame_size = FRAMESIZE_SXGA;
  ti32_cam_config.pixel_format = PIXFORMAT_JPEG;
  ti32_cam_config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  ti32_cam_config.fb_location = CAMERA_FB_IN_PSRAM;
  ti32_cam_config.jpeg_quality = 10;
  ti32_cam_config.fb_count = 1;

  if (!psramFound()) {
    ti32_cam_config.frame_size = FRAMESIZE_SVGA;
    ti32_cam_config.fb_location = CAMERA_FB_IN_DRAM;
  }
}

void applySensorSettings()
{
  sensor_t *s = esp_camera_sensor_get();
  if (!s) return;

  bool is_ov2640 = (s->id.PID == 0x26);

  // Near-default tuning. Earlier builds cranked everything to +2, which made
  // quality worse: max sharpening on 16x gain amplifies sensor noise, max
  // contrast crushes shadows, and max brightness + max exposure comp washes
  // out white paper. The real problem was focus, not tuning.
  s->set_special_effect(s, 0);      // 0 = normal colour (2 = grayscale)
  s->set_vflip(s, 1);
  s->set_hmirror(s, 0);
  s->set_whitebal(s, 1);
  s->set_awb_gain(s, 1);
  s->set_wb_mode(s, 0);             // auto
  s->set_exposure_ctrl(s, 1);
  s->set_gain_ctrl(s, 1);
  s->set_brightness(s, 1);          // +1: modest lift for indoor light
  s->set_contrast(s, 1);            // +1: a little punch for ink on paper
  s->set_saturation(s, 0);
  s->set_sharpness(s, 1);
  s->set_ae_level(s, 1);            // +1 exposure compensation
  s->set_gainceiling(s, GAINCEILING_8X);  // more headroom in dim rooms
  s->set_lenc(s, 1);
  s->set_bpc(s, 1);
  s->set_wpc(s, 1);

  if (is_ov2640) {
    s->set_aec2(s, 1);
    s->set_dcw(s, 1);
  }

  // ---- OPTIONAL HARDWARE-MOD-ONLY REGISTER ----
  // Register 0x3031 bit[3] bypasses the sensor's internal DVDD regulator,
  // which is what generates the heat. DO NOT enable this unless you have
  // physically replaced the expansion board's 1V3 regulator with a 1V5 part
  // (e.g. NCP115AMX150TCG). On a stock board this removes the digital core's
  // only supply and the sensor browns out until a full power cycle.
  //
  // Uncomment ONLY after doing the hardware mod:
  // s->set_reg(s, 0x3031, 0x08, 0x08);
  // Serial.printf("0x3031 = 0x%02X\n", s->get_reg(s, 0x3031, 0xFF));
}

// Power up the sensor and apply settings. Returns true on success.
bool cameraPowerUp()
{
  if (camera_running) return true;

  esp_err_t err = esp_camera_init(&ti32_cam_config);
  if (err != ESP_OK) {
    Serial.printf("cameraPowerUp: init failed 0x%x\n", err);
    return false;
  }
  camera_running = true;
  af_ready = false;

  sensor_t *s = esp_camera_sensor_get();
  bool is_ov5640 = s && (s->id.PID == 0x5640);

  if (is_ov5640) {
    // HEAT FIX (from Seeed's merged example PR #26): register 0x302C
    // bits[7:6] set the sensor's output pad drive strength. Default 11 = 4x,
    // which runs hot. 00 = 1x is enough for the short board-level traces on
    // the XIAO and noticeably cooler. Must be set before AF/framesize calls.
    s->set_reg(s, 0x302C, 0xC0, 0x00);
  }

  applySensorSettings();

  if (is_ov5640) {
    // Upload the AF firmware (~4 KB over SCCB) and start continuous AF.
    // Re-done on every power-up because esp_camera_deinit() drops it.
    unsigned long t = millis();
    ti32_af.start(s);
    uint8_t r1 = ti32_af.focusInit();
    uint8_t r2 = (r1 == 0) ? ti32_af.autoFocusMode() : 0xFF;
    af_ready = (r1 == 0 && r2 == 0);
    Serial.printf("AF firmware %s (init=%u mode=%u) in %lu ms\n",
                  af_ready ? "loaded" : "FAILED", r1, r2, millis() - t);
  }
  return true;
}

// Power the sensor back down so it stops streaming and cools off.
void cameraPowerDown()
{
  if (!camera_running) return;
  esp_camera_deinit();
  camera_running = false;
}
#endif // CAMERA

void setup()
{
  Serial.begin(115200);
  Serial.println("delay");
  delay(2000);
  Serial.println("=== TI-32 v3.20-OV5640 /// ===");

  // Explicitly bring up PSRAM. This should already be on via the Tools
  // menu setting (PSRAM = OPI PSRAM), but if it isn't, this is our fallback.
  if (psramInit()) {
    Serial.printf("PSRAM init OK: total %u bytes\n", (unsigned)ESP.getPsramSize());
  } else {
    Serial.println("PSRAM init FAILED — camera+HTTPS will not fit in DRAM");
  }

  Serial.println("[CBL]");
  delay(1000);

  cbl.setLines(TIP, RING);
  cbl.resetLines();
  cbl.setupCallbacks(header, data, MAXDATALEN, onReceived, onRequest);
  // cbl.setVerbosity(true, (HardwareSerial *)&Serial);

  pinMode(TIP, INPUT);
  pinMode(RING, INPUT);

  Serial.println("[preferences]");
  prefs.begin("ccalc", false);
  auto reboots = prefs.getUInt("boots", 0);
  Serial.print("reboots: ");
  Serial.println(reboots);
  prefs.putUInt("boots", reboots + 1);
  prefs.end();
  // (WiFi mode init moved below — must run AFTER esp_camera_init or the
  // camera fails to allocate its frame buffer.)

#ifdef CAMERA
  Serial.println("[camera]");

  buildCameraConfig();

  // Bring the sensor up once at boot purely to verify it works and log which
  // sensor is fitted, then power it straight back down. From here on the
  // sensor only runs during an actual capture — see the cold-capture note
  // above cameraPowerUp().
  if (!cameraPowerUp()) {
    Serial.println("camera init FAILED");
  } else {
    sensor_t *s = esp_camera_sensor_get();
    Serial.printf("sensor PID: 0x%04x ", s->id.PID);
    Serial.println(s->id.PID == 0x5640 ? "(OV5640 - 5MP)" :
                   s->id.PID == 0x26   ? "(OV2640 - 2MP)" : "(unknown)");
    Serial.println("camera ready");
    camera_sign = true;
    cameraPowerDown();
    Serial.println("camera powered down (cold-capture mode)");
  }
#endif

  // WiFi init goes AFTER camera init so the camera gets first crack at
  // PSRAM/heap for its frame buffer.
  Serial.println("[wifi init]");
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  Serial.println("wifi mode set");

  strncpy(message, "default message", MAXSTRARGLEN);
  delay(100);
  memset(data, 0, MAXDATALEN);
  memset(header, 0, 16);
  Serial.println("[ready]");
}

void (*queued_action)() = NULL;

void loop()
{
  if (queued_action)
  {
    // dont ask me why you need this, but it fails otherwise.
    // probably relates to a CBL2 timeout thing?
    delay(1000);
    Serial.println("executing queued actions");
    // dont ask me
    void (*tmp)() = queued_action;
    queued_action = NULL;
    tmp();
  }
  if (command >= 0 && command <= MAXCOMMAND)
  {
    for (int i = 0; i < NUMCOMMANDS; ++i)
    {
      if (commands[i].id == command && commands[i].num_args == currentArg)
      {
        if (commands[i].wifi && !WiFi.isConnected())
        {
          setError("wifi not connected");
        }
        else
        {
          Serial.print("processing command: ");
          Serial.println(commands[i].name);
          commands[i].command_fp();
        }
      }
    }
  }
  cbl.eventLoopTick();
}

int onReceived(uint8_t type, enum Endpoint model, int datalen)
{
  char varName = header[3];

  Serial.print("unlocked: ");
  Serial.println(unlocked);

  // No password required as of v3.4 — auto-unlock on first command.
  // Set REQUIRE_PASSWORD to 1 to re-enable chromalock's anti-inspection
  // password gate (calculator must Send(P) with PASSWORD value first).
#define REQUIRE_PASSWORD 0

  // Accept the password var either way, for back-compat with users who
  // still type Send(P) out of habit.
  if (!unlocked && varName == 'P')
  {
    auto password = TIVar::realToLong8x(data, model);
    if (password == PASSWORD)
    {
      Serial.println("successful unlock");
      unlocked = true;
      return 0;
    }
    else
    {
      Serial.println("failed unlock");
    }
  }

  // With REQUIRE_PASSWORD off, the first command also unlocks the chip.
  if (!unlocked && !REQUIRE_PASSWORD)
  {
    unlocked = true;
    Serial.println("auto-unlocked (no password mode)");
  }

  if (!unlocked)
  {
    return -1;
  }

  // check for command
  if (varName == 'C')
  {
    if (type != VarTypes82::VarReal)
    {
      return -1;
    }
    int cmd = TIVar::realToLong8x(data, model);
    if (cmd >= 0 && cmd <= MAXCOMMAND)
    {
      Serial.print("command: ");
      Serial.println(cmd);
      startCommand(cmd);
      return 0;
    }
    else
    {
      Serial.print("invalid command: ");
      Serial.println(cmd);
      return -1;
    }
    
  }
      if (varName == 'V') {
    if (type != VarTypes82::VarReal) {
      return -1;
    }
    PAGE_PAGE = TIVar::realToLong8x(data, model);
    Serial.print("Received page number: ");
    Serial.println(PAGE_PAGE);
    sendPage();
    return 0;
  }

  if (varName == 'X') {
    Serial.println("Recieved var X");
    if (type != VarTypes82::VarReal) {
      Serial.println("var x not equal vartypes82:varreal");
      return -1;

    }
    Serial.println("Reset fullResponse to empty");
    fullResponse = "";
    
    return 0;
  }

  if (currentArg >= MAXARGS)
  {
    Serial.println("argument overflow");
    setError("argument overflow");
    return -1;
  }

  switch (type)
  {
  case VarTypes82::VarString:
    Serial.print("len: ");
    strncpy(strArgs[currentArg++], TIVar::strVarToString8x(data, model).c_str(), MAXSTRARGLEN);
    fixStrVar(strArgs[currentArg - 1]);
    Serial.print("Str");
    Serial.print(currentArg - 1);
    Serial.print(" ");
    Serial.println(strArgs[currentArg - 1]);
    break;
  case VarTypes82::VarReal:
    realArgs[currentArg++] = TIVar::realToFloat8x(data, model);
    Serial.print("Real");
    Serial.print(currentArg - 1);
    Serial.print(" ");
    Serial.println(realArgs[currentArg - 1]);
    break;
  default:
    // maybe set error here?
    return -1;
  }
  return 0;
}

uint8_t frameCallback(int idx)
{
  return frame[idx];
}

char varIndex(int idx)
{
  return '0' + (idx == 9 ? 0 : (idx + 1));
}

int onRequest(uint8_t type, enum Endpoint model, int *headerlen, int *datalen, data_callback *data_callback)
{
  char varName = header[3];
  char strIndex = header[4];
  char strname[5] = {'S', 't', 'r', varIndex(strIndex), 0x00};
  char picname[5] = {'P', 'i', 'c', varIndex(strIndex), 0x00};
  Serial.print("request for ");
  Serial.println(varName == 0xaa ? strname : varName == 0x60 ? picname
                                                             : (const char *)&header[3]);
  memset(header, 0, sizeof(header));
  switch (varName)
  {
  case 0x60:
    if (type != VarTypes82::VarPic)
    {
      return -1;
    }
    *datalen = PICVARSIZE;
    TIVar::intToSizeWord(*datalen, &header[0]);
    header[2] = VarTypes82::VarPic;
    header[3] = 0x60;
    header[4] = strIndex;
    *data_callback = frameCallback;
    break;
  case 0xAA:
    if (type != VarTypes82::VarString)
    {
      return -1;
    }
    // Every string we hand the calculator is padded to exactly PAGE_SIZE
    // (96) characters = 6 rows x 16 cols on the TI-84 Plus home screen.
    //
    // Why: the calculator displays it with Output(1,1,Str0), which wraps at
    // the 16-char row boundary. A fixed 96-char payload means the text always
    // lays out as exactly 6 full rows with no ragged edge, and short messages
    // blank out the rest of the screen instead of leaving stale pixels.
    //
    // Padding also guarantees we never send a zero-length string variable,
    // which makes the calculator throw ERR:INVALID DIM.
    {
      String outStr = String(message);
      if (outStr.length() > (unsigned)PAGE_SIZE) {
        outStr = outStr.substring(0, PAGE_SIZE);
      }
      while (outStr.length() < (unsigned)PAGE_SIZE) outStr += " ";
      *datalen = TIVar::stringToStrVar8x(outStr, data, model);
    }
    TIVar::intToSizeWord(*datalen, header);
    header[2] = VarTypes82::VarString;
    header[3] = 0xAA;
    // send back as same variable that was requested
    header[4] = strIndex;
    *headerlen = 13;
    break;
  case 'E':
    if (type != VarTypes82::VarReal)
    {
      return -1;
    }
    *datalen = TIVar::longToReal8x(error, data, model);
    TIVar::intToSizeWord(*datalen, header);
    header[2] = VarTypes82::VarReal;
    header[3] = 'E';
    header[4] = '\0';
    *headerlen = 13;
    break;
  case 'S':
    if (type != VarTypes82::VarReal)
    {
      return -1;
    }
    *datalen = TIVar::longToReal8x(status, data, model);
    TIVar::intToSizeWord(*datalen, header);
    header[2] = VarTypes82::VarReal;
    header[3] = 'S';
    header[4] = '\0';
    *headerlen = 13;
    break;
  default:
    return -1;
  }
  return 0;
}

int makeRequest(String url, char *result, int resultLen, size_t *len)
{
  memset(result, 0, resultLen);

#ifdef SECURE
  WiFiClientSecure client;
  client.setInsecure();
#else
  WiFiClient client;
#endif
  HTTPClient http;
  http.setAuthorization(HTTP_USERNAME, HTTP_PASSWORD);

  Serial.println(url);
  http.begin(client, url.c_str());

  // Send HTTP GET request
  int httpResponseCode = http.GET();
  Serial.print(url);
  Serial.print(" ");
  Serial.println(httpResponseCode);

  int responseSize = http.getSize();
  WiFiClient *httpStream = http.getStreamPtr();

  Serial.print("response size: ");
  Serial.println(responseSize);

  if (httpResponseCode != 200)
  {
    return httpResponseCode;
  }

  if (httpStream->available() > resultLen)
  {
    Serial.print("response size: ");
    Serial.print(httpStream->available());
    Serial.println(" is too big");
    return -1;
  }

  while (httpStream->available())
  {
    *(result++) = httpStream->read();
  }
  *len = responseSize;

  http.end();

  return 0;
}

void connect()
{
  const char *ssid = WIFI_SSID;
  const char *pass = WIFI_PASS;
  Serial.print("SSID: ");
  Serial.println(ssid);
  Serial.print("PASS: ");
  Serial.println("<hidden>");

  // If we're already on the right network, skip the reconnect — it might
  // crash, and there's nothing to do anyway.
  if (WiFi.isConnected() && String(WiFi.SSID()) == String(ssid)) {
    Serial.println("already on target SSID, skipping reconnect");
  } else {
    // Just call WiFi.begin directly. The arduino-esp32 core 3.x WiFi stack
    // crashes on disconnect()/mode() calls in some states, so don't touch
    // them — let begin() handle the transition. If the chip was on a
    // different network with the same name, begin will roam; if on a
    // different SSID, the timeout below catches it.
    WiFi.begin(ssid, pass);
  }

  // Wait up to 15 seconds for a real connection. Don't busy-spin forever.
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED)
  {
    if (millis() - start > 15000)
    {
      Serial.println("connect timeout");
      setError("connect timeout");
      return;
    }
    if (WiFi.status() == WL_CONNECT_FAILED)
    {
      setError("failed to connect");
      return;
    }
    delay(200);
    Serial.print(".");
  }

  // Print what we ACTUALLY ended up associated with — catches the
  // "silently still on home wifi" case.
  Serial.println();
  Serial.print("connected to SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("RSSI: ");
  Serial.println(WiFi.RSSI());

  // Surface the real SSID to the calculator too, so you can see it on screen.
  snprintf(message, MAXSTRARGLEN, "connected: %s", WiFi.SSID().c_str());
  setSuccess(message);
}

void disconnect()
{
  WiFi.disconnect(true);
  setSuccess("disconnected");
}

void clearChat() {
  fullResponse = "";
}

void reply() {
  Serial.println("Reply action initiated");
  const char* userReply = strArgs[0];
  Serial.print("prompt: ");
  Serial.println(userReply);
  // Append the user's reply to the existing conversation
  fullResponse += "| User: " + String(userReply) + "| AI: ";
  Serial.print("full response: ");
  Serial.println(fullResponse);
  // Send the updated conversation to the server
  auto url = String(SERVER) + String("/gpt/ask?question=") + urlEncode(fullResponse);
  Serial.println("made url");
  Serial.println(url);

  size_t realsize = 0;
  Serial.println("sending request");
  if (makeRequest(url, response, MAXHTTPRESPONSELEN, &realsize)) {
    setError("error making request");
    return;
  }
  Serial.println("request recieved");

  // Update fullResponse with the new AI response
  fullResponse += String(response);

  PAGE_PAGE = 0;  // Reset to first page
  sendPage();
}

void gpt() {
  const char* prompt = strArgs[0];
  Serial.print("prompt: ");
  Serial.println(prompt);

  // Don't prepend the prompt — it breaks the server's 16-char row padding
  // and wastes screen space the user already knows the contents of.
  fullResponse = "";

  auto url = String(SERVER) + String("/gpt/ask?question=") + urlEncode(String(prompt));

  size_t realsize = 0;
  if (makeRequest(url, response, MAXHTTPRESPONSELEN, &realsize)) {
    setError("error making request");
    return;
  }

  fullResponse += String(response);
  Serial.print("Full response: ");
  Serial.println(fullResponse);

  PAGE_PAGE = 0; 
  sendPage();
}

// ---------------------------------------------------------------------------
//  wrapForCalc — lay text out for the TI-84 Plus home screen (16 cols).
//
//  1. Sanitize to characters the calculator can display. ArTICL's string
//     converter silently DROPS any byte >= 0x7F, so a curly quote or a "x"
//     multiplication sign would vanish and shift every later character,
//     knocking the row alignment off. Common Unicode is translated to ASCII
//     first; anything else is removed as a whole character.
//  2. Greedy word wrap: if the next word doesn't fit on the current 16-char
//     row, it moves to the next row. Words are never split unless a single
//     word is longer than 16 characters.
//  3. Pad every row to exactly 16 chars and concatenate, so Output(1,1,Str0)
//     and the 96-char pages both land exactly on row boundaries.
//
//  Done here (not only on the server) because this is the last step before
//  the bytes reach the calculator — it's the only place that knows exactly
//  what will be displayed.
// ---------------------------------------------------------------------------
static String asciiFor(uint32_t cp)
{
  switch (cp) {
    case 0x2018: case 0x2019: case 0x2032: return "'";
    case 0x201C: case 0x201D: case 0x2033: return "\"";
    case 0x2013: case 0x2014: case 0x2212: return "-";
    case 0x00D7: case 0x22C5: case 0x2219: return "*";
    case 0x00F7: return "/";
    case 0x00B2: return "^2";
    case 0x00B3: return "^3";
    case 0x00B0: return " deg";
    case 0x03C0: return "pi";
    case 0x221A: return "sqrt";
    case 0x2248: return "~";
    case 0x2260: return "!=";
    case 0x2264: return "<=";
    case 0x2265: return ">=";
    case 0x00B1: return "+/-";
    case 0x2026: return "...";
    case 0x2192: return "->";
    case 0x221E: return "inf";
    case 0x0394: return "delta";
    case 0x03B8: return "theta";
    case 0x00A0: return " ";
    default: return "";              // unknown symbol: drop it cleanly
  }
}

String wrapForCalc(const String &in)
{
  const int COLS = 16;

  // --- 1. sanitize (decode UTF-8, map to ASCII) ---
  String clean;
  clean.reserve(in.length());
  int n = in.length();
  for (int i = 0; i < n; ) {
    uint8_t c = (uint8_t)in[i];
    if (c < 0x80) {
      clean += (c < 0x20 || c == 0x7F) ? ' ' : (char)c;   // newlines/tabs -> space
      i++;
      continue;
    }
    int extra = (c >= 0xF0) ? 3 : (c >= 0xE0) ? 2 : (c >= 0xC0) ? 1 : 0;
    uint32_t cp = (extra == 3) ? (c & 0x07) : (extra == 2) ? (c & 0x0F) : (c & 0x1F);
    i++;
    for (int k = 0; k < extra && i < n; k++, i++) cp = (cp << 6) | ((uint8_t)in[i] & 0x3F);
    clean += asciiFor(cp);
  }

  // --- 2 + 3. greedy word wrap, pad rows to 16 ---
  String out;
  String line;
  int p = 0, L = clean.length();
  while (p < L) {
    while (p < L && clean[p] == ' ') p++;          // skip spaces
    if (p >= L) break;
    int q = p;
    while (q < L && clean[q] != ' ') q++;
    String word = clean.substring(p, q);
    p = q;

    while (word.length() > (unsigned)COLS) {        // over-long token: hard break
      if (line.length()) { while (line.length() < (unsigned)COLS) line += ' '; out += line; line = ""; }
      out += word.substring(0, COLS);
      word = word.substring(COLS);
    }
    if (!word.length()) continue;

    if (!line.length()) {
      line = word;
    } else if (line.length() + 1 + word.length() <= (unsigned)COLS) {
      line += ' ';
      line += word;
    } else {                                        // doesn't fit: new row
      while (line.length() < (unsigned)COLS) line += ' ';
      out += line;
      line = word;
    }
  }
  if (line.length()) { while (line.length() < (unsigned)COLS) line += ' '; out += line; }
  if (!out.length()) out = "NO RESPONSE";
  return out;
}

// CHAT (command 18): send a typed follow-up question to /gpt/chat. The server
// remembers the most recent photo and answer, so this continues that
// conversation. Uses its own HTTP call (30 s timeout + getString) rather than
// makeRequest(), whose 5 s default timeout is too short for a Claude call.
void chat()
{
  const char *q = strArgs[0];
  Serial.print("chat question: ");
  Serial.println(q);

#ifdef SECURE
  WiFiClientSecure client;
  client.setInsecure();
#else
  WiFiClient client;
#endif
  HTTPClient http;
  http.setTimeout(30000);
  String url = String(SERVER) + "/gpt/chat?question=" + urlEncode(String(q));
  http.begin(client, url.c_str());
  int code = http.GET();
  Serial.printf("GET /gpt/chat -> %d\n", code);

  if (code != 200) {
    http.end();
    char e[40];
    snprintf(e, sizeof(e), "chat http %d", code);
    fullResponse = wrapForCalc(String(e));
    PAGE_PAGE = 0;
    sendPage();
    return;
  }
  String body = http.getString();
  http.end();

  fullResponse = wrapForCalc(body);
  PAGE_PAGE = 0;
  sendPage();
}

void sendPage() {
  int len = (int)fullResponse.length();

  // Nothing paginated yet — the command failed, or no response arrived.
  // Do NOT overwrite `message`: it still holds whatever setError() wrote,
  // which is the only diagnostic the calculator can show the user.
  if (len == 0) {
    if (message[0] == '\0') {
      strncpy(message, "NO RESPONSE", MAXSTRARGLEN);
    }
    Serial.print("sendPage: empty fullResponse, keeping message: ");
    Serial.println(message);
    setSuccess(message);
    return;
  }

  // Clamp the page index instead of letting it run off the end. Requesting a
  // page past the last one just re-sends the last page, so the calculator
  // never has to detect "end of pages" via an empty string.
  int maxPage = (len - 1) / PAGE_SIZE;
  if (PAGE_PAGE < 0) PAGE_PAGE = 0;
  if (PAGE_PAGE > maxPage) PAGE_PAGE = maxPage;

  int start = PAGE_PAGE * PAGE_SIZE;
  String pageContent = fullResponse.substring(start, min(start + PAGE_SIZE, len));

  // A zero-length TI string variable makes the calculator throw
  // ERR:INVALID DIM. Always send at least one character.
  if (pageContent.length() == 0) pageContent = " ";

  strncpy(message, pageContent.c_str(), MAXSTRARGLEN);
  message[MAXSTRARGLEN - 1] = '\0';
  Serial.printf("sendPage: page %d/%d, %u chars\n",
                PAGE_PAGE, maxPage, (unsigned)pageContent.length());
  setSuccess(message);
}

void send()
{
  const char *recipient = strArgs[0];
  const char *message = strArgs[1];
  Serial.print("sending \"");
  Serial.print(message);
  Serial.print("\" to \"");
  Serial.print(recipient);
  Serial.println("\"");
  setSuccess("OK: sent");
}

void _sendLauncher()
{
  // The blob in launcher.h is the CAMERA program. Sending it under that name
  // drops it straight into the calculator's PRGM list, so a RAM-cleared calc
  // can be re-armed with 5->C : Send(C) and no computer.
  sendProgramVariable("CAMERA", __launcher_var, __launcher_var_len);
}

void launcher()
{
  // Queue it — the transfer fails if we start while the CBL2 library still
  // has the link lines.
  queued_action = _sendLauncher;
  setSuccess("queued transfer");
}

#ifdef CAMERA
// Capture a JPEG frame from the OV2640/OV3660 and POST it to a server route.
// Returns the HTTP status code on success, or a negative errno-style code on
// transport failure. The server's response body is copied into `result` (up to
// `resultLen-1` bytes, NUL-terminated) and the byte count goes into `*outLen`.
//
// `route` is appended to SERVER, e.g. "/gpt/solve" or "/gpt/snap".
int captureAndPost(const String &route, char *result, int resultLen, size_t *outLen)
{
  memset(result, 0, resultLen);
  *outLen = 0;

  if (!camera_sign) {
    Serial.println("captureAndPost: camera not available");
    return -10;
  }

  // COLD CAPTURE. The sensor has been powered down since the last shot, so
  // it's at ambient temperature and its first frames are clean. Power it up,
  // grab quickly, power it back down.
  unsigned long t0 = millis();
  if (!cameraPowerUp()) {
    Serial.println("captureAndPost: cameraPowerUp failed");
    return -10;
  }

  // Wait for autofocus to lock, draining frames meanwhile so auto-exposure
  // converges in parallel. Continuous AF typically locks in 0.5-2 s.
  // Timeout at 3 s so a failed lock still produces a (softer) picture.
  {
    unsigned long af_t0 = millis();
    bool focused = false;
    // Auto-exposure needs time to ramp up from a cold start, independently
    // of focus. AF can lock in <1 s, so don't stop just because focus
    // locked — keep draining frames until at least AE_SETTLE_MS has passed.
    const unsigned long AE_SETTLE_MS = 1500;
    while (millis() - af_t0 < 3000) {
      camera_fb_t *w = esp_camera_fb_get();
      if (w) esp_camera_fb_return(w);
      if (af_ready && ti32_af.getFWStatus() == FW_STATUS_S_FOCUSED) {
        focused = true;
        if (millis() - af_t0 >= AE_SETTLE_MS) break;
      }
      if (!af_ready && millis() - af_t0 > 800) break;  // non-AF sensor
    }
    Serial.printf("focus %s after %lu ms\n",
                  focused ? "LOCKED" : "not locked", millis() - af_t0);
    // The buffered frame may predate the lock — throw one more away.
    camera_fb_t *w = esp_camera_fb_get();
    if (w) esp_camera_fb_return(w);
  }

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("captureAndPost: esp_camera_fb_get returned NULL");
    cameraPowerDown();
    return -11;
  }
  if (fb->format != PIXFORMAT_JPEG) {
    Serial.println("captureAndPost: frame is not JPEG");
    esp_camera_fb_return(fb);
    cameraPowerDown();
    return -12;
  }
  Serial.printf("sensor was powered up for %lu ms before capture\n",
                millis() - t0);
  Serial.printf("captured %u bytes (%ux%u)\n", (unsigned)fb->len, fb->width, fb->height);

  // Copy the JPEG into our own PSRAM buffer, then power the sensor down
  // BEFORE the upload. The POST takes 2-5 seconds over a phone hotspot —
  // leaving the sensor streaming through all of that is exactly the
  // self-heating we're trying to avoid. esp_camera_deinit() also frees the
  // frame buffer pool, so we can't hold a pointer into it across the call.
  size_t jpeg_len = fb->len;
  uint8_t *jpeg = (uint8_t *)ps_malloc(jpeg_len);
  if (!jpeg) {
    Serial.println("captureAndPost: ps_malloc for JPEG copy failed");
    esp_camera_fb_return(fb);
    cameraPowerDown();
    return -13;
  }
  memcpy(jpeg, fb->buf, jpeg_len);
  esp_camera_fb_return(fb);
  cameraPowerDown();
  Serial.printf("sensor powered down; uploading %u bytes\n", (unsigned)jpeg_len);
  Serial.printf("free heap before POST: %u  PSRAM found: %d\n",
                (unsigned)ESP.getFreeHeap(), (int)psramFound());

#ifdef SECURE
  WiFiClientSecure client;
  client.setInsecure();
#else
  WiFiClient client;
#endif
  HTTPClient http;
  http.setAuthorization(HTTP_USERNAME, HTTP_PASSWORD);
  http.setTimeout(30000);  // vision calls take a while

  String url = String(SERVER) + route;
  Serial.println(url);
  http.begin(client, url.c_str());

  // Use the standard image/jpeg mime — Render's edge proxy rejects the
  // non-standard image/jpg before it reaches the Node app. Server-side
  // bodyParser is now configured to accept any image/* type.
  http.addHeader("Content-Type", "image/jpeg");

  int status = http.POST(jpeg, jpeg_len);
  Serial.print("POST ");
  Serial.print(url);
  Serial.print(" -> ");
  Serial.println(status);

  free(jpeg);

  if (status > 0 && status < 400) {
    String body = http.getString();
    size_t copy = min((size_t)(resultLen - 1), (size_t)body.length());
    memcpy(result, body.c_str(), copy);
    result[copy] = 0;
    *outLen = copy;
  }

  http.end();
  return status;
}
#endif // CAMERA

void snap()
{
#ifdef CAMERA
  if (!camera_sign) {
    setError("camera failed to initialize");
    return;
  }
  // "snap" just confirms the camera works and returns the captured byte count
  // back to the calculator as a success message. Useful for debugging from
  // a TI-BASIC applet without burning vision-API tokens.
  size_t outLen = 0;
  int status = captureAndPost("/gpt/snap", response, MAXHTTPRESPONSELEN, &outLen);
  // Distinguish camera errors (-10..-12) from HTTP transport errors (<0)
  if (status <= -10 && status >= -12) {
    setError("camera capture failed");
    return;
  }
  if (status < 0) {
    snprintf(message, MAXSTRARGLEN, "http send err %d (heap?)", status);
    setError(message);
    return;
  }
  if (status == 404) {
    snprintf(message, MAXSTRARGLEN, "snap ok (no upload)");
    setSuccess(message);
    return;
  }
  if (status >= 400) {
    snprintf(message, MAXSTRARGLEN, "snap http %d", status);
    setError(message);
    return;
  }
  setSuccess(response);
#else
  setError("pictures not supported");
#endif
}

void solve()
{
#ifdef CAMERA
  if (!camera_sign) {
    setError("camera failed to initialize");
    return;
  }
  // realArgs[0] is an optional question number from the calculator
  // ("solve question 3"). We pass it as ?n=3 to /gpt/solve.
  int qNum = (int)realArgs[0];
  String route = "/gpt/solve";
  if (qNum > 0) {
    route += "?n=" + String(qNum);
  }

  size_t outLen = 0;
  int status = captureAndPost(route, response, MAXHTTPRESPONSELEN, &outLen);
  if (status < 0) {
    setError("camera capture failed");
    return;
  }
  if (status >= 400) {
    snprintf(message, MAXSTRARGLEN, "solve http %d", status);
    setError(message);
    return;
  }

  // Reuse the existing pager so long answers can be scrolled on the calculator.
  fullResponse = wrapForCalc(String(response));
  PAGE_PAGE = 0;
  sendPage();
#else
  setError("pictures not supported");
#endif
}

void image_list()
{
  int page = realArgs[0];
  auto url = String(SERVER) + String("/image/list?p=") + urlEncode(String(page));

  size_t realsize = 0;
  if (makeRequest(url, response, MAXSTRARGLEN, &realsize))
  {
    setError("error making request");
    return;
  }

  Serial.print("response: ");
  Serial.println(response);

  setSuccess(response);
}

void fetch_image()
{
  memset(frame + 2, 0, 756);
  // fetch image and put it into the frame variable
  int id = realArgs[0];
  Serial.print("id: ");
  Serial.println(id);

  auto url = String(SERVER) + String("/image/get?id=") + urlEncode(String(id));

  size_t realsize = 0;
  if (makeRequest(url, response, MAXHTTPRESPONSELEN, &realsize))
  {
    setError("error making request");
    return;
  }

  if (realsize != PICSIZE)
  {
    Serial.print("response size:");
    Serial.println(realsize);
    setError("bad image size");
    return;
  }

  // load the image
  frame[0] = realsize & 0xff;
  frame[1] = (realsize >> 8) & 0xff;
  memcpy(&frame[2], response, 756);

  setSuccess(response);
}

void fetch_chats()
{
  int room = realArgs[0];
  int page = realArgs[1];
  auto url = String(SERVER) + String("/chats/messages?p=") + urlEncode(String(page)) + String("&c=") + urlEncode(String(room));

  size_t realsize = 0;
  if (makeRequest(url, response, MAXSTRARGLEN, &realsize))
  {
    setError("error making request");
    return;
  }

  Serial.print("response: ");
  Serial.println(response);

  setSuccess(response);
}

void send_chat()
{
  int room = realArgs[0];
  const char *msg = strArgs[1];

  auto url = String(SERVER) +
             String("/chats/send?c=") +
             urlEncode(String(room)) +
             String("&m=") +
             urlEncode(String(msg)) +
             String("&id=") +
             urlEncode(String(CHAT_NAME));

  size_t realsize = 0;
  if (makeRequest(url, response, MAXSTRARGLEN, &realsize))
  {
    setError("error making request");
    return;
  }

  Serial.print("response: ");
  Serial.println(response);

  setSuccess(response);
}

void program_list()
{
  int page = realArgs[0];
  auto url = String(SERVER) + String("/programs/list?p=") + urlEncode(String(page));

  size_t realsize = 0;
  if (makeRequest(url, response, MAXSTRARGLEN, &realsize))
  {
    setError("error making request");
    return;
  }

  Serial.print("response: ");
  Serial.println(response);

  setSuccess(response);
}

char programName[256];
char programData[4096];
size_t programLength;

void _resetProgram()
{
  memset(programName, 0, 256);
  memset(programData, 0, 4096);
  programLength = 0;
}

void _sendDownloadedProgram()
{
  if (sendProgramVariable(programName, (uint8_t *)programData, programLength))
  {
    Serial.println("failed to transfer requested download");
    Serial.print(programName);
    Serial.print("(");
    Serial.print(programLength);
    Serial.println(")");
  }
  _resetProgram();
}

void fetch_program()
{
  int id = realArgs[0];
  Serial.print("id: ");
  Serial.println(id);

  _resetProgram();

  auto url = String(SERVER) + String("/programs/get?id=") + urlEncode(String(id));

  if (makeRequest(url, programData, 4096, &programLength))
  {
    setError("error making request for program data");
    return;
  }

  size_t realsize = 0;
  auto nameUrl = String(SERVER) + String("/programs/get_name?id=") + urlEncode(String(id));
  if (makeRequest(nameUrl, programName, 256, &realsize))
  {
    setError("error making request for program name");
    return;
  }

  queued_action = _sendDownloadedProgram;

  setSuccess("queued download");
}

/// OTHER FUNCTIONS

int sendProgramVariable(const char *name, uint8_t *program, size_t variableSize)
{
  Serial.print("transferring: ");
  Serial.print(name);
  Serial.print("(");
  Serial.print(variableSize);
  Serial.println(")");

  int dataLength = 0;

  // IF THIS ISNT SET TO COMP83P, THIS DOESNT WORK
  // seems like ti-84s cant silent transfer to each other
  uint8_t msg_header[4] = {COMP83P, RTS, 13, 0};

  uint8_t rtsdata[13] = {variableSize & 0xff, variableSize >> 8, VarTypes82::VarProgram, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
  int nameSize = strlen(name);
  if (nameSize == 0)
  {
    return 1;
  }
  memcpy(&rtsdata[3], name, min(nameSize, 8));

  auto rtsVal = cbl.send(msg_header, rtsdata, 13);
  if (rtsVal)
  {
    Serial.print("rts return: ");
    Serial.println(rtsVal);
    return rtsVal;
  }

  cbl.resetLines();
  auto ackVal = cbl.get(msg_header, NULL, &dataLength, 0);
  if (ackVal || msg_header[1] != ACK)
  {
    Serial.print("ack return: ");
    Serial.println(ackVal);
    return ackVal;
  }

  auto ctsRet = cbl.get(msg_header, NULL, &dataLength, 0);
  if (ctsRet || msg_header[1] != CTS)
  {
    Serial.print("cts return: ");
    Serial.println(ctsRet);
    return ctsRet;
  }

  msg_header[1] = ACK;
  msg_header[2] = 0x00;
  msg_header[3] = 0x00;
  ackVal = cbl.send(msg_header, NULL, 0);
  if (ackVal || msg_header[1] != ACK)
  {
    Serial.print("ack cts return: ");
    Serial.println(ackVal);
    return ackVal;
  }

  msg_header[1] = DATA;
  msg_header[2] = variableSize & 0xff;
  msg_header[3] = (variableSize >> 8) & 0xff;
  auto dataRet = cbl.send(msg_header, program, variableSize);
  if (dataRet)
  {
    Serial.print("data return: ");
    Serial.println(dataRet);
    return dataRet;
  }

  ackVal = cbl.get(msg_header, NULL, &dataLength, 0);
  if (ackVal || msg_header[1] != ACK)
  {
    Serial.print("ack data: ");
    Serial.println(ackVal);
    return ackVal;
  }

  msg_header[1] = EOT;
  msg_header[2] = 0x00;
  msg_header[3] = 0x00;
  auto eotVal = cbl.send(msg_header, NULL, 0);
  if (eotVal)
  {
    Serial.print("eot return: ");
    Serial.println(eotVal);
    return eotVal;
  }

  Serial.print("transferred: ");
  Serial.println(name);
  return 0;
}
