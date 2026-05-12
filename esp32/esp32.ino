// =============================================================================
//   TI-32 FIRMWARE v2.9 ///
//   - Camera enabled (XIAO ESP32-S3 Sense, OV2640)
//   - Wired D0=TIP, D2=RING (video-2 layout)
//   - Forces clean WiFi reconnect, prints actual SSID, 15s timeout
//   - POSTs JPEG to /gpt/snap and /gpt/solve, image/jpeg content-type
// =============================================================================
// Project: TI-32 (chromalock base, modified)
// Date:    2026

#include "./secrets.h"
#include "./launcher.h"
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
constexpr auto PASSWORD = 69420;

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
const int PAGE_SIZE = 100;
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
};

constexpr int NUMCOMMANDS = sizeof(commands) / sizeof(struct Command);
// Bumped from 14 -> 17 so commands sendPage(15), reply(16), clearChat(17) are
// actually dispatched by loop(). The camera commands snap(7) and solve(8) are
// already <= 14, but enabling everything keeps the launcher/UI features working.
constexpr int MAXCOMMAND = 17;

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

void setup()
{
  Serial.begin(115200);
  Serial.println("delay");
  delay(2000);
  Serial.println("=== TI-32 v2.9 /// ===");

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

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  // SVGA (800x600) JPEG color at quality 8 — readable for handwritten text
  // and printed problems. Buffer lives in PSRAM so this doesn't crowd WiFi.
  // ~60-120 KB per frame; uploads in 2-3 sec over a phone hotspot.
  config.frame_size = FRAMESIZE_SVGA;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = 8;   // 0=best, 63=worst. 8 = good detail for text.
  config.fb_count = 1;       // single buffer — DMA fits, leaves room for WiFi

  // We keep fb_count=1 even with PSRAM — see comment above. The extra buffer
  // doesn't fit alongside WiFi's heap allocations.
  if (config.pixel_format == PIXFORMAT_JPEG && !psramFound())
  {
    // No PSRAM at all — fall back to smaller frames in regular DRAM.
    config.frame_size = FRAMESIZE_SVGA;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }
  // If we have PSRAM + JPEG, keep the VGA / fb_count=1 / PSRAM settings
  // configured above. (No else branch — the old chromalock code had one
  // that forced 240x240 which is useless for our use case.)

  // camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK)
  {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    return;
  }
  else
  {
    Serial.println("camera ready");
    camera_sign = true; // Camera initialization check passes
  }

  sensor_t *s = esp_camera_sensor_get();
  // Color (no special effect). For grayscale uncomment: s->set_special_effect(s, 2);
  s->set_special_effect(s, 0);
  // OV2640 ships flipped on the XIAO Sense; flip the image so the lens
  // poking out the back of the calculator gives an upright photo.
  s->set_vflip(s, 1);
  s->set_hmirror(s, 1);
  // Auto exposure / white balance ON
  s->set_whitebal(s, 1);
  s->set_awb_gain(s, 1);
  s->set_exposure_ctrl(s, 1);
  s->set_aec2(s, 1);
  // Image tuning for paper/text. These nudge the autoexposure toward shorter
  // shutter times (less motion blur) and crank contrast so faint pencil
  // strokes show up clearly. Values range -2..+2 unless otherwise noted.
  s->set_brightness(s, 1);          // slightly brighter
  s->set_contrast(s, 2);            // max contrast (ink stands out)
  s->set_saturation(s, 0);          // neutral
  s->set_sharpness(s, 2);           // crisper edges
  s->set_denoise(s, 1);             // mild noise reduction
  s->set_gainceiling(s, GAINCEILING_4X);  // cap auto-gain to avoid grainy frames
  s->set_aec_value(s, 300);         // bias exposure shorter for less motion blur
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

  // check for password
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
    // TODO right now, the only string variable will be the message, but ill need to allow for other vars later
    *datalen = TIVar::stringToStrVar8x(String(message), data, model);
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

  fullResponse = "User: " + String(prompt) + " | AI: ";

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

void sendPage() {
  int start = PAGE_PAGE * PAGE_SIZE;
  String pageContent = fullResponse.substring(start, min(start + PAGE_SIZE, (int)fullResponse.length()));
  
  strncpy(message, pageContent.c_str(), MAXSTRARGLEN);
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
  sendProgramVariable("TI32", __launcher_var, __launcher_var_len);
}

void launcher()
{
  // we have to queue this action, since otherwise the transfer fails
  // due to the CBL2 library still using the lines
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
    Serial.println("captureAndPost: camera not initialized");
    return -10;
  }

  // Throw away several warmup frames. The OV2640's autoexposure and AWB
  // converge over the first few frames; using the very first one gives a
  // dark/over-exposed shot. 4 discarded frames + 200ms delay gives a stable
  // exposure before we keep the next.
  for (int i = 0; i < 4; ++i) {
    camera_fb_t *warmup = esp_camera_fb_get();
    if (warmup) esp_camera_fb_return(warmup);
  }
  delay(200);

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("captureAndPost: esp_camera_fb_get returned NULL");
    return -11;
  }
  if (fb->format != PIXFORMAT_JPEG) {
    Serial.println("captureAndPost: frame is not JPEG");
    esp_camera_fb_return(fb);
    return -12;
  }
  Serial.printf("captured %u bytes (%ux%u)\n", (unsigned)fb->len, fb->width, fb->height);
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

  int status = http.POST(fb->buf, fb->len);
  Serial.print("POST ");
  Serial.print(url);
  Serial.print(" -> ");
  Serial.println(status);

  // Done with the frame buffer regardless of how the POST went.
  esp_camera_fb_return(fb);

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
  fullResponse = String(response);
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
