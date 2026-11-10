# ENME 350 Exam 2: Solver Reference for an AI Model

Paste this whole document into the model's context before asking it ENME 350 circuit questions for practice, homework checking or exam review.

---

## 0. Instructions to the model

You are helping a mechanical engineering student (UMD, ENME 350 Electronics and Instrumentation I, Fall 2026, Dr. Mitchell) study for Exam 2.

**Hard rules**

1. On the exam the student has **two double-sided A4 formula sheets** and nothing else. Section 2 is their content. Solve from those formulas; if you need anything else, derive it in the answer.
2. **Method constraints are graded.** If a problem names a method ("use superposition", "use phasors", "evaluate all four diode states", "use the Shockley equation"), use exactly that method and show its setup. A faster route may be mentioned only as a check.
3. **Show full supporting work and box the final answers.** The course gives no credit for an answer without full work. End each part with a clearly marked final line.
4. **Verify every answer** with something you did not use to derive it (Section 13). State the check.
5. **Concept first.** Define each symbol in plain words before the equation. Then give the numbers.
6. Be concise and structured. No em dashes in prose.
7. A negative answer is meaningful: the true direction or polarity is opposite the one drawn. Never silently flip a sign.
8. For phasor work, **always state whether magnitudes are peak or RMS**. Course default: phasor magnitude = peak.
9. Angles: keep phasor angles in degrees, in (−180°, 180°]. When evaluating cos(ωt + φ) at a time, ωt is in **radians**; convert before adding φ in degrees.

**Exam 2 scope** (per the course "Core Concepts" slide)

- Everything from Exam 1: §1.1 to 4.4 (KCL/KVL, Ohm, nodal, mesh, superposition, Wheatstone, Thévenin/Norton, capacitors and inductors, first-order circuits **including RL**), Labs 1 to 3.
- New, and the main emphasis: §4.5, 5.1 to 5.6 (second-order circuits), 10.1 to 10.6 (sinusoidal sources, phasors, complex impedance, AC power), 13.1 to 13.3 (diodes), Lab 4 (RC circuits), Lab 5 (second-order RLC), Lab 6 (RLC phasors).
- Not in scope: §12, §14, §6, §15.5.

**How homework asks questions (expect the same style on the exam)**

- HW9: RL first order. Time for an inductor current to reach a value; i(t) for t > 0 after a switch; two inductor loops with two τ values.
- HW10: Damping level from the characteristic roots; v_C(t) and i_L(t) for three R values (over, critical, under).
- HW11: Amplitude, period, frequency, v(t) at a given time; I_rms from a plotted waveform; "the complementary solution dies out".
- HW12: Time signal to phasor (sin and negative signs); adding sinusoids with phasors; multiplying and dividing phasors in A e^{jφ} and A∠φ form.
- HW13: Input impedance at a design ω; v(t) and i(t) in a phasor circuit; superposition (possibly sources at different ω, or AC + DC).
- HW14: Shockley equation at 75 °F; load line and operating point; diode power.
- HW15 and diode homework: assume on/off and check; evaluate every state of a two-diode circuit (2^n states); Zener breakdown (BDV) cases.

**How past Midterm 2 exams ask questions (Section 11 has every problem type with methods and answers)**

- Short answers worth 6 to 10 points: pick curves, read a phasor diagram, Ohm's law with a given Z, compare load lines, critical R and resonant frequency, τ and stored energy.
- 20-point problems: phasor NODAL or MESH analysis **with dependent sources** (method named, no credit otherwise); Norton or Thévenin with phasors; "derive the governing equation" for an RC or RLC circuit; diode circuits solved for both assumptions with a justification; diode tables of V_out vs V_in; diode transfer characteristic with slopes and intercepts.
- Answers are often required **symbolically** (load-line intercepts in terms of v_s, v_B, R_s, R_B; α, ω₀ and f(t) in terms of R, L, C).

---

## 1. Units and arithmetic conventions

- Work in V, mA, kΩ where the circuit uses kΩ: mA × kΩ = V.
- Farads and henries in base units: 10 µF = 10e-6 F, 20 mH = 0.02 H.
- τ: RC (Ω × F = s), L/R (H / Ω = s). µF × kΩ = ms. mH / kΩ = µs.
- ω (rad/s) vs f (Hz): ω = 2πf. Impedances use ω, never f.
- Keep 4 significant figures in intermediate complex arithmetic; round at the end.
- Calculator in **degree** mode for phasors. For cos(ωt + φ) at a time, either convert ωt to degrees (× 180/π) or put everything in radians.

---

## 2. The permitted formula sheets (content)

### Sheet side 1: DC fundamentals and methods

- Ohm: v = iR, p = vi = i²R = v²/R. Passive sign convention: current entering + absorbs.
- KCL: Σi_in = Σi_out. KVL: enter − exit + is a rise (+v); enter + exit − is a drop (−v).
- Series: R_s = ΣR. Parallel: 1/R_p = Σ1/R; two: R₁R₂/(R₁+R₂).
- Voltage divider: v_k = v_s R_k / ΣR. Current divider: i₁ = i_s R₂/(R₁+R₂).
- Reduction method: colour nodes; same node pair = parallel; node with exactly two elements = series.
- Nodal: Σ(V_n − V_m)/R = Σ i_injected. Supernode: KCL on the bubble plus V_a − V_b = V_s.
- Mesh: clockwise; ΣR(i_this − i_adj) = Σ v_rises. Current source on outer edge fixes that mesh; shared current source → supermesh + constraint.
- Superposition: V source off → short; I source off → open; dependent sources stay on; never superpose power.
- Source transformation: v_s series R ⇔ i_s = v_s/R parallel R.
- Thévenin: V_th = V_oc; R_th by killing sources, V_oc/I_sc, or a test source (required with dependent sources). Norton: I_N = V_th/R_th.
- Max power: R_L = R_th, P_max = V_th²/(4R_th).
- Wheatstone: balanced when R₁/R₂ = R₃/R₄; V_th = V_s[R₂/(R₁+R₂) − R₄/(R₃+R₄)], R_th = R₁∥R₂ + R₃∥R₄, i_g = V_th/(R_th + R_g).
- Bridge lattice: apply 1 V, R_eq = 1/i.
- Extras: R = ρL/A, C = εA/d, w = ½Cv² = Q²/2C, p = dw/dt, KE = ½mv², derivatives of sin/cos, ∫₀ᵗ e^{−aτ}dτ = (1 − e^{−at})/a.
- Resistor colour code 0 to 9: black, brown, red, orange, yellow, green, blue, violet, grey, white; gold ±5%.

### Sheet side 2: C, L, first order, Labs 1 to 3

| | Capacitor | Inductor |
|---|---|---|
| i–v | i = C dv/dt | v = L di/dt |
| integral | v = (1/C)∫i dt + v(0) | i = (1/L)∫v dt + i(0) |
| energy | ½Cv² | ½Li² |
| DC | open | short |
| continuous | v_C | i_L |
| series | 1/C_eq = Σ1/C | L_eq = ΣL |
| parallel | C_eq = ΣC | 1/L_eq = Σ1/L |

- First order (RC and RL): x(t) = x(∞) + [x(0) − x(∞)] e^{−t/τ}; τ = R_th C or L/R_th, R_th seen after switching.
- 1τ 63.2%, 2τ 86.5%, 3τ 95.0%, 5τ 99.3% of the change.
- Time to reach x₁: t = τ ln[(x(0) − x(∞))/(x₁ − x(∞))].
- τ from data: τ = −t/ln(1 − v/V_f) (rising), τ = −t/ln(v/V₀) (falling).
- Choosing a method table; common mistakes list; ADALM, meters, Labs 1 to 3 (Section 9).

### Sheet side 3: second order, sinusoids, RMS, phasors

- Procedure: t < 0 DC steady state → continuity → initial slope (dv_C/dt = i_C/C, di_L/dt = v_L/L) → x(∞) → characteristic equation → form → constants → check.
- s² + 2αs + ω₀² = 0, s = −α ± √(α² − ω₀²).
- Series RLC: α = R/2L, R_crit = 2√(L/C). Parallel RLC: α = 1/2RC, R_crit = ½√(L/C). ω₀ = 1/√(LC). ζ = α/ω₀.
- Over (α > ω₀): x = x(∞) + A₁e^{s₁t} + A₂e^{s₂t}; A₁ + A₂ = Δ; s₁A₁ + s₂A₂ = x′(0).
- Critical (α = ω₀): x = x(∞) + (B₁ + B₂t)e^{−αt}; B₁ = Δ; B₂ − αB₁ = x′(0).
- Under (α < ω₀): ω_d = √(ω₀² − α²); x = x(∞) + e^{−αt}(D₁cos ω_d t + D₂sin ω_d t); D₁ = Δ; −αD₁ + ω_d D₂ = x′(0).
- Undamped (α = 0): oscillates at ω₀ forever.
- Δ = x(0) − x(∞). Root check: s₁ + s₂ = −2α, s₁s₂ = ω₀².
- Sinusoid v = V_m cos(ωt + φ): f = ω/2π, T = 2π/ω, V_pp = 2V_m.
- Conversions: sin x = cos(x − 90°); −sin x = cos(x + 90°); −cos x = cos(x ± 180°).
- RMS: √[(1/T)∫x² dt]; sine V_m/√2; square ±A → A; triangle A/√3; half-wave sine V_m/2; DC + sine √(V_DC² + V_m²/2); piecewise √(Σx_k²Δt_k/T).
- Phasor: V_m cos(ωt + φ) ↔ V_m∠φ = V_m e^{jφ}. Add in rectangular; multiply/divide in polar. j = 1∠90°, 1/j = −j. d/dt ↔ ×jω.

### Sheet side 4: impedance, AC analysis, AC power, diodes, Labs 4 to 6

- Z_R = R, Z_L = jωL (i lags v 90°), Z_C = 1/(jωC) = −j/(ωC) (i leads v 90°).
- V = IZ; series/parallel like resistors; Y = 1/Z.
- DC: L short, C open. Series resonance ω₀ = 1/√(LC), Z = R.
- Phasor method: sources to +cos phasors → Z at the source ω → any DC method → back to time.
- Different ω: superposition is mandatory; add in the time domain only.
- AC power: P = ½V_mI_m cos θ = V_rms I_rms cos θ, θ = θ_v − θ_i = ∠Z. Q = V_rms I_rms sin θ. S = V_rms I_rms* = ½VI* = P + jQ. pf = cos θ (lagging = inductive). P_R = I_rms²R; L and C absorb no average power.
- Max power: Z_L = Z_th*, P_max = |V_th|²/(8R_th) with peak |V_th|.
- Shockley: i_D = I_S(e^{v_D/(nV_T)} − 1), V_T = kT/q, k = 1.381e-23 J/K, q = 1.602e-19 C. 75 °F = 297.0 K → V_T = 25.6 mV.
- Load line: i_D = (V_S − v_D)/R; iterate v_D = nV_T ln(i_D/I_S + 1). P_D = v_D i_D.
- Diode states: on (V_F, check i_D > 0), off (open, check −BDV < v_AK < V_F), reverse breakdown (BDV, cathode +, check reverse current > 0).
- Rectifiers: half-wave peak V_p − V_F; bridge V_p − 2V_F; ripple ΔV ≈ V_peak/(fRC).
- Labs 4 to 6 (Section 9).

---

## 3. Reading circuits correctly

### Nodes
A node is one continuous stretch of wire. List every element by the two nodes it touches; that list decides series and parallel. A wire diagonal is a wire, not a component.

### Switches in transient problems
- Draw **two circuits**: t < 0 (switch in its old position, DC steady state) and t > 0.
- "Closed for a long time" means DC steady state: C open, L short.
- A switch that opens can leave an L or C in a loop with no source: a source-free response.
- Two L (or C) branches that the switch separates into independent loops each get their own τ.

### Diodes
- Triangle points from anode to cathode; the bar or the stripe on the real part is the cathode.
- Zener drawn with a bent bar; its breakdown voltage (BDV) appears only for current flowing cathode to anode.
- "−V_dd = 24 V" style labels: read the sign carefully. If the problem says V_dd is effectively −24 V, the node is at −24 V.

### AC circuits
- Source given as sin, or with a minus sign: convert to +cos before writing the phasor.
- Element values may be given as L and C, or already as impedances (j5 Ω, −j10 Ω). If given as impedances, ω is already applied.
- "Designed for ω = 55 rad/s" means use that ω in every impedance.

---

## 4. RL and RC first order (worked)

### 4.1 Time to reach a current (HW9 pattern)
12 V source, switch closes at t = 0 onto R = 4 kΩ in series with L = 20 mH (i_L(0) = 0).

1. Initial: i_L(0) = 0 (continuity, inductor current cannot jump).
2. Final: L is a short, i(∞) = 12 V / 4 kΩ = 3 mA.
3. τ = L/R = 0.02/4000 = 5 µs.
4. i(t) = 3 − 3e^{−t/5µs} mA.
5. Time to 2 mA: t = τ ln[(0 − 3)/(2 − 3)] = 5 µs × ln 3 = **5.49 µs**.

Check: at t = 5.49 µs, 3(1 − e^{−1.0986}) = 3(1 − 0.3333) = 2.000 mA.

### 4.2 Switch opens, inductor discharges
Before t = 0 the inductor carries I₀ (DC: L short). After opening, it discharges through the resistance it now sees, R_th: i(t) = I₀e^{−t R_th/L}. The voltage across the inductor can jump (and reverse sign). Find it from v_L = −i R_th at t = 0⁺.

### 4.3 Two inductors, two loops (HW9 #3 pattern)
After the switch, if each inductor sits in its own loop with its own resistance, solve each independently: i₁(t) with τ₁ = L₁/R₁, i₂(t) with τ₂ = L₂/R₂. At t = 0 each current equals its pre-switch DC value.

---

## 5. Second-order circuits (worked)

### 5.1 Damping from the roots (HW10 #1)
Series RLC, R = 35 Ω, L = 2 H, C = 0.25 F.

- Characteristic equation: s² + (R/L)s + 1/(LC) = s² + 17.5s + 2 = 0.
- α = R/2L = 8.75 s⁻¹, ω₀ = 1/√(0.5) = 1.414 rad/s. α > ω₀.
- s = −8.75 ± √(76.5625 − 2) = −8.75 ± 8.635.
- **s₁ = −0.115 s⁻¹, s₂ = −17.385 s⁻¹: real, distinct, negative → overdamped.**

Check: s₁ + s₂ = −17.5 = −2α; s₁s₂ = 2.000 = ω₀².

### 5.2 Full response, three damping cases (HW10 #2)
V₁ = 28 V, R₁ in series with L₁ = 1 H feeding a node with C₁ = 0.25 F to ground and R₂ = 1 Ω to ground through a switch. Switch closed for a long time, opens at t = 0.

**t < 0:** L short, C open. Current flows V₁ → R₁ → L → R₂.
i_L(0) = 28/(R₁ + 1), v_C(0) = i_L(0) × R₂ = 28/(R₁ + 1).

**t > 0:** R₂ removed, series RLC: V₁, R₁, L₁, C₁. i_L = C dv_C/dt.
- v_C(∞) = 28 V, i_L(∞) = 0.
- dv_C/dt(0⁺) = i_L(0)/C = 4 i_L(0).
- s² + R₁s + 4 = 0 → ω₀ = 2, α = R₁/2.

| R₁ | i_L(0), v_C(0) | Roots | Case |
|---|---|---|---|
| 5 Ω | 4.667 A, 4.667 V | −1, −4 | over |
| 4 Ω | 5.6 A, 5.6 V | −2, −2 | critical |
| 1 Ω | 14 A, 14 V | −0.5 ± j1.936 | under |

**R₁ = 5 Ω:** A₁ + A₂ = 4.667 − 28 = −23.333; −A₁ − 4A₂ = 18.667 → A₂ = 1.556, A₁ = −24.889.
v_C = 28 − 24.89e^{−t} + 1.556e^{−4t} V; i_L = 0.25 v_C′ = 6.222e^{−t} − 1.556e^{−4t} A.

**R₁ = 4 Ω:** B₁ = 5.6 − 28 = −22.4; B₂ − 2B₁ = 22.4 → B₂ = −22.4.
v_C = 28 − 22.4(1 + t)e^{−2t} V; i_L = 5.6(1 + 2t)e^{−2t} A.

**R₁ = 1 Ω:** ω_d = √(4 − 0.25) = 1.936. D₁ = 14 − 28 = −14; −0.5D₁ + 1.936D₂ = 56 → D₂ = 25.30.
v_C = 28 + e^{−0.5t}(−14cos 1.936t + 25.30 sin 1.936t) V; i_L = e^{−0.5t}(14cos 1.936t + 3.615 sin 1.936t) A.

Checks: each i_L(0) reproduces the table; each v_C → 28 V; roots satisfy sum and product rules. These were confirmed against a numerical ODE simulation.

### 5.3 Finding x′(0) in general
Draw the t = 0⁺ circuit with C replaced by a voltage source v_C(0) and L by a current source i_L(0). Solve that resistive circuit for i_C(0⁺) or v_L(0⁺). Then dv_C/dt = i_C/C, di_L/dt = v_L/L.

---

## 6. Sinusoids, RMS and phasors (worked)

### 6.1 Signal parameters (HW11 #2)
v(t) = 50cos(30t + 10°) V.
- Amplitude V_m = 50 V.
- ω = 30 rad/s, f = 30/2π = **4.775 Hz**, T = 2π/30 = **0.2094 s**.
- v(0.25): 30 × 0.25 = 7.5 rad = 429.72°; 429.72 + 10 = 439.72° → 79.72°; 50cos(79.72°) = **8.92 V**.

### 6.2 RMS from a plotted waveform (HW11 #3 pattern)
Steps: find one period T; square each segment; integrate x² over the period (rectangles: x²Δt; ramps from a to b: Δt(a² + ab + b²)/3); divide by T; square root.
Example: 2 A for 1 s, then −1 A for 2 s (T = 3 s): I_rms = √[(4·1 + 1·2)/3] = **√2 = 1.414 A**.

### 6.3 Complementary solution dies out (HW11 #1)
Complete response = natural (complementary) part with e^{−αt} or e^{−t/τ} + forced (particular) sinusoid at the source frequency. After about 5 time constants the natural part is below 1% of its start, leaving only the steady sinusoid. Phasor analysis computes only that steady-state part.

### 6.4 Time to phasor (HW12 #1)
| Signal | +cos form | Phasor |
|---|---|---|
| 25cos(4t − 10°) V | same | **25∠−10° V** |
| −6sin(10t + 60°) A | 6cos(10t + 150°) | **6∠150° A** |
| 100sin(20t − 60°) V | 100cos(20t − 150°) | **100∠−150° V** |
| −10cos(15t + 20°) A | 10cos(15t − 160°) | **10∠−160° A** |

### 6.5 Adding sinusoids (HW12 #2)
1. 4cos(30t + 20°) − 5cos(30t − 30°): (3.759 + j1.368) − (4.330 − j2.500) = −0.571 + j3.868 = 3.910∠98.4° → **3.910cos(30t + 98.4°)**.
2. 50sin(20t) + 25cos(20t − 40°): −j50 + (19.151 − j16.070) = 19.151 − j66.070 = 68.79∠−73.84° → **68.79cos(20t − 73.8°)**.
3. 10sin(300t) + 15cos(300t + 60°) − 5sin(300t − 30°): −5sin(300t − 30°) = 5cos(300t + 60°). Sum: −j10 + (7.5 + j12.990) + (2.5 + j4.330) = 10 + j7.321 = 12.39∠36.2° → **12.39cos(300t + 36.2°)**.

Quadrant rule: in (1) the real part is negative, so the angle is 180° − 81.6° = 98.4°, not −81.6°.

### 6.6 Products and quotients (HW12 #3)
5sin(80t − 140°) = 5cos(80t − 230°) = 5∠130°.
1. (6∠40°)(5∠130°) = **30∠170° = 30e^{j170°}**.
2. (4∠40°)/(5∠130°) = **0.8∠−90° = 0.8e^{−j90°}**.

---

## 7. Impedance and AC circuit analysis (worked)

### 7.1 Input impedance (HW13 #1 pattern)
R = 10 Ω in series with (L = 0.5 H ∥ C = 10 mF), ω = 10 rad/s.
- Z_L = j(10)(0.5) = j5 Ω. Z_C = 1/(j·10·0.01) = −j10 Ω.
- Parallel: (j5)(−j10)/(j5 − j10) = 50/(−j5) = j10 Ω.
- **Z_in = 10 + j10 = 14.14∠45° Ω** (inductive).
Work from the far end toward the terminals; add in rectangular, divide in polar.

### 7.2 v(t) and i(t) in a series RLC (HW13 #2 pattern)
v₁ = 10cos(4t) V, R = 2 Ω, L = 0.5 H, C = 0.25 F in series.
- Z_L = j2, Z_C = 1/(j·4·0.25) = −j1. Z = 2 + j1 = 2.236∠26.57° Ω.
- I = 10∠0° / 2.236∠26.57° = **4.472∠−26.57° A → i(t) = 4.472cos(4t − 26.57°) A**.
- V_R = 8.944∠−26.57°, V_L = 8.944∠63.43°, V_C = 4.472∠−116.57° V → v_C(t) = 4.472cos(4t − 116.57°) V.

KVL check in rectangular: (8 − j4) + (4 + j8) + (−2 − j4) = 10 + j0 = V₁. ✓

### 7.3 Superposition with different frequencies (HW13 #3 pattern)
5 V DC + 10cos(2t) V in series with R = 5 Ω and L = 2.5 H.
- DC alone (ω = 0, L short): i′ = 5/5 = 1 A.
- AC alone: Z = 5 + j5 = 7.071∠45° Ω → I″ = 1.414∠−45° A.
- **i(t) = 1 + 1.414cos(2t − 45°) A.** Add in time, never as phasors.

### 7.4 Nodal and mesh with phasors
Identical to DC, but every R becomes Z and every source a phasor. Write KCL with (V_a − V_b)/Z. Solve the linear system with complex arithmetic (Cramer's rule or substitution). Keep each coefficient in rectangular form.

### 7.5 Thévenin with phasors
V_th = open-circuit phasor voltage; Z_th = impedance looking in with sources killed (or V_oc/I_sc). Max average power to Z_L = Z_th*.

---

## 8. AC power (worked)

v = 100cos(ωt) V across Z = 30 + j40 = 50∠53.13° Ω.
- I = 100∠0°/50∠53.13° = 2∠−53.13° A (peak).
- P = ½(100)(2)cos 53.13° = **60 W**. Check ½I_m²R = ½(4)(30) = 60 W. ✓
- Q = ½(100)(2)sin 53.13° = **80 VAR**. |S| = 100 VA. pf = 0.6 **lagging** (inductive, current lags).
- Using RMS: V_rms = 70.71 V, I_rms = 1.414 A, P = 70.71 × 1.414 × 0.6 = 60 W. Same answer; never mix ½ with RMS.

---

## 9. Diodes (worked)

### 9.1 Shockley equation (HW14 #2)
75 °F → (75 − 32)(5/9) + 273.15 = 297.04 K. V_T = (1.381e-23)(297.04)/(1.602e-19) = **25.60 mV**. I_S = 1e-9 A, n = 1.

| v_D | v_D/V_T | i_D |
|---|---|---|
| 0.60 V | 23.44 | **15.1 A** |
| 0.70 V | 27.35 | **753 A** |
| 0.75 V | 29.30 | **5309 A** |

Observation: the current grows exponentially; each +59 mV multiplies it by 10 (n = 1). Expected from Shockley, but the magnitudes are unrealistic because I_S = 1 nA is very large for silicon (typical about 1e-14 A) and a real diode has series resistance that limits current.

### 9.2 Load line and operating point (HW14 #3 pattern)
V_S = 5 V, R = 1 kΩ, I_S = 1e-14 A, n = 1, V_T = 25.6 mV.
- Load line: i_D = (5 − v_D)/1 kΩ. Intercepts (0 V, 5 mA) and (5 V, 0 mA).
- Iterate: v_D = 0.7 → i_D = 4.300 mA → v_D = 0.02560 ln(4.3e-3/1e-14) = 0.6857 V → i_D = 4.314 mA → v_D = 0.6858 V. Converged.
- **Q point: v_D = 0.686 V, i_D = 4.31 mA. P_D = 0.6858 × 4.314 mA = 2.96 mW.**

### 9.3 Single diode: assume and check (HW15 #1 pattern)
10 V source, 1 kΩ, diode (FBV 0.7 V) forward in the loop.
- Assume on: v_D = 0.7, i_D = (10 − 0.7)/1 k = 9.3 mA > 0. ✓ Consistent.
- Assume off: i_D = 0, so v_D = 10 V > 0.7 V. ✗ It would conduct.
- **On is correct: v_D = 0.7 V, i_D = 9.3 mA.**
If a resistor value changes (25 Ω → 50 Ω type questions), redo both checks; the state can change when a divider drops the open-circuit v_AK below 0.7 V.

### 9.4 Two Zener diodes, all states (diode homework pattern)
18 V → R₁ = 4.5 kΩ → node A → D1 (cathode at A, anode at X) → node X. D2 cathode at X, anode at ground. X → R₂ = 2.5 kΩ → −24 V. FBV 0.7 V; BDV D1 = 7.5 V, D2 = 5 V.
I₁ = (18 − V_A)/4.5k down through R₁ and into D1 (reverse direction for D1). I₂ = (V_X + 24)/2.5k. KCL at X: I_D2,rev = I₁ − I₂.

| D1 | D2 | Result | Valid? |
|---|---|---|---|
| Reverse | Reverse | V_X = 5, V_A = 12.5; I₁ = 1.222 mA, I₂ = 11.6 mA; I_D2,rev = −10.38 mA | ✗ |
| **Reverse** | **Forward** | V_X = −0.7, V_A = 6.8; **I₁ = 2.489 mA, I₂ = 9.32 mA**; I_D2,fwd = 6.83 mA > 0 | **✓** |
| Forward | Reverse | V_A = 4.3; I_D1,fwd = −I₁ = −3.04 mA | ✗ |
| Forward | Forward | V_A = −1.4; I_D1,fwd = −4.31 mA | ✗ |
| Forward | Off | I₁ = I₂ → V_A = −9.45; I_D1,fwd = −6.10 mA | ✗ |
| Reverse | Off | I₁ = I₂ → V_X = −11.68; D2 sees 11.68 V forward | ✗ |
| Off | Off | V_A = 18, V_X = −24; D1 sees 42 V reverse > 7.5 | ✗ |
| Off | Reverse | V_A = 18, V_X = 5; D1 sees 13 V reverse > 7.5 | ✗ |
| Off | Forward | V_A = 18, V_X = −0.7; D1 sees 18.7 V reverse > 7.5 | ✗ |

### 9.5 Diode + Zener with a load (pattern)
10 V battery, forward diode on top, 2 kΩ then 5 V Zener (cathode toward R) between rails, output across the rails, open circuit.
KVL: 10 − 0.7 − 2000 I − 5.0 − 0.7 = 0 → **I = 1.8 mA, V_O = 8.6 V**. Zener check: 8.6 V across R + Zener > 5 V, so it breaks down. ✓

### 9.6 Two-node resistor network with one diode (Pre-Lab 7)
5 V → 100 Ω → V₁ → 100 Ω → ground; 5 V → 2.2 kΩ → V₂ → 470 Ω → ground; diode V₁ → V₂ (FBV 0.6 V).
- Open-circuit: V₁ = 2.50 V, V₂ = 0.88 V → v_AK = 1.62 V → on.
- KCL with V₂ = V₁ − 0.6: (5 − 2V₁)/100 + (5.6 − V₁)/2200 = (V₁ − 0.6)/470 → **V₁ = 2.38 V, V₂ = 1.78 V, i_D = 2.33 mA**.
- Swap 2.2 kΩ and 470 Ω: V₂ = 4.12 V > V₁ = 2.50 V → **off, i_D = 0**.

---

## 10. Lab knowledge (Labs 1 to 6)

### Hardware and Scopy
- Scope inputs are differential; 1− and 2− go to ground.
- Signal Generator amplitude is peak-to-peak. Offset shifts DC. 0 to 5 V square wave = amplitude 5 V, offset 2.5 V.
- Power Supply tool: V+ and V−, click Enable. Voltmeter tool: DC mode for steady readings.
- W1 output resistance about 50 Ω; it adds to any series R and sags the source under heavy load.
- Export data: Oscilloscope settings → Export → CSV. Print button gives only a picture.
- Breadboard: 5 holes in a numbered column are one node; rails run the length.

### Lab 4 (RC transients)
τ = time to 63.2% of a rise or to 36.8% on a decay. τ = −t/ln[(v − v_∞)/(v₀ − v_∞)]. Compare with RC. Square wave period must be well over 10τ to see full charging.

### Lab 5 (second-order RLC, square wave input)
Example set: L = 1 mH, C = 0.047 µF and 0.1 µF in series = 0.032 µF.
- ω₀ = 1/√(1e-3 × 3.2e-8) = 176,800 rad/s, f₀ = 28.1 kHz.
- R_crit = 2√(L/C) = 353.6 Ω.
- R = 1 kΩ: overdamped. R = 23.5 Ω: underdamped, f_d ≈ 28.1 kHz, peak spacing ΔT ≈ 35.6 µs.
- Measured ΔT is usually longer and the ringing decays faster than predicted because the generator's 50 Ω and the coil resistance add to R. The pot setting at critical damping is usually below 353.6 Ω for the same reason.
- R_eff from a divider: R_eff = 100(5 − V₁₀₀)/V₁₀₀.

### Lab 6 (RLC phasors)
- Gain magnitude = V_out,pp / V_in,pp.
- Phase = 360° × Δt / T, with Δt between matching zero crossings. Output later than input → negative phase (lags).
- Current phasor = V_R / R (in phase with V_R).
- Compare measured magnitude and phase with the phasor calculation at the same ω = 2πf.

### Lab 7 / diodes in the lab
- 1N4001 forward drop about 0.55 to 0.65 V at mA currents.
- i–v from a series resistor: i_D = (CH1 − CH2)/R, plot against v_D = CH2.
- Half-wave rectifier peak is about 0.6 V below the source peak.
- Filter capacitor: ripple ≈ V_peak/(fRC) only when RC is much longer than the period. With 1 kΩ at 60 Hz (T = 16.7 ms), 10 µF (RC = 10 ms) measured about 0.9 V of ripple; 47 µF (RC = 47 ms) about 0.27 V.

---

## 11. Past Midterm 2 problems: types, methods and answers

Answers marked "key" come from the instructor's posted solutions. Ones marked ✓ were re-derived here and agree.

### 11.1 Reading a phasor diagram (Spring 2026 #1)
A network drives Z₁ in series with Z₂ ∥ Z₃. The diagram shows V₂, I₂ and I₃ as arrows on Re/Im axes.
- Read each arrow tip as a + jb from the grid, then convert to polar. I₃ tip at (4, 4) → I₃ = 4 + j4 = **5.657∠45° A** (key: "none of the above").
- Z₂ = V₂ / I₂ (both read off the diagram). Key: **Z₂ = 1.789∠26.25° Ω**.
- Element type from the angle of Z: 0° → R only; +90° → L only; −90° → C only; between 0° and +90° → R and L (series **or** parallel both give a positive angle); between 0° and −90° → R and C. Key for Z₂ at +26.25°: **R and L in series, and R and L in parallel** (both).
- Drawing a phasor diagram (Fall 2023 #1b): one arrow per phasor from the origin, length = magnitude, angle measured counter-clockwise from +Re; label each.

### 11.2 Load line with symbols (Spring 2026 #2)
Loop: v_s, R_s, diode, R_B, and a second source v_B opposing v_s.
KVL: v_s − i_D R_s − v_D − i_D R_B − v_B = 0 → i_D = (v_s − v_B − v_D)/(R_s + R_B).
- v_D intercept (i_D = 0): **x = v_s − v_B**. i_D intercept (v_D = 0): **y = (v_s − v_B)/(R_s + R_B)** (key ✓).
- Comparing load lines (Fall 2025 #1c): same source, so same v_D intercept; i_D intercept = V_S/R. The **steeper** line (larger current intercept) has the **smaller** R. Lines meeting the axis at 10 V with intercepts 10 mA and 5 mA → R₁ = 1 kΩ < R₂ = 2 kΩ (key: R₁ < R₂ ✓).

### 11.3 First-order "derive the governing equation"
**Spring 2026 #3:** 5 V through 25 kΩ, 100 kΩ across C = 10 µF; switch moves to add another 100 kΩ and disconnect the source.
- Before: C open, divider: V_C = 5 × 100/125 = **4 V** ✓.
- After: C sees 100 kΩ ∥ 100 kΩ = 50 kΩ. KCL at the capacitor node: C dV_C/dt + V_C/50k = 0 → **dV_C/dt + 2V_C = 0** ✓, **τ = 0.5 s** ✓.
- General form: KCL at the capacitor node (or KVL around the inductor loop), write i_C = C dv/dt, collect terms: dx/dt + x/τ = forcing. Read τ from the coefficient.

**Fall 2023 #1a:** 5 V, R₁ = 2 Ω, R₂ = 3 Ω; switch closed connects R₃ = 6 Ω ∥ C = 2 µF.
- Before: R₂ ∥ R₃ = 2 Ω, V_C = 5 × 2/(2 + 2) = 2.5 V, w = ½(2µ)(2.5²) = **6.25 µJ** ✓.
- After opening: C discharges through R₃ only: τ = 6 × 2µ = **12 µs = 0.012 ms** ✓. Equation: dV_C/dt + V_C/(12 µs) = 0.

**Spring 2024 #1b:** 30 mA source with 80 kΩ, switch, 20 kΩ to the node with 60 kΩ and 400 nF.
- Before: 80 kΩ vs (20 k + 60 k) = 80 kΩ splits 30 mA equally: 15 mA × 60 kΩ = **900 V** ✓; w = ½(400n)(900²) = **0.162 J** ✓.
- After: the 20 kΩ dangles, so C sees 60 kΩ only: τ = 60k × 400n = **24 ms**. The posted key says 2.4 µs; that does not match these values. Show the work and state 24 ms, noting the discrepancy.

### 11.4 RL time constants and curves
- **Spring 2023 #1a:** before: 5 V / (10 + 5) Ω = **0.333 A**. After closing (R₁ ∥ R₂ = 3.33 Ω, + R₃ = 8.33 Ω): **0.6 A**, τ = 1 mH / 8.33 Ω = **0.12 ms** ✓.
- **Spring 2022 #1a:** 3 A source, 1 kΩ; closed switch shorts 2 kΩ: i_L = **3 A**. Open: L in series with 2 kΩ, parallel 1 kΩ: i_L = 3 × 1k/3k = **1 A**, τ = 10 mH / 3 kΩ = **3.33 µs** ✓.
- **Curve picking (Fall 2025 #1a):** switch closes on series RL. v_L jumps to V_S then decays exponentially to 0 (curve that starts high and decays). i_L starts at 0 and rises exponentially to V_S/R (concave down, flattening). Key: v_L = curve 5, i_L = curve 2.

### 11.5 Ohm's law with a given impedance (Fall 2025 #1b)
I = 30∠0° V / 55∠−21° kΩ = **0.545∠21° mA = 545∠21° µA** ✓. Divide magnitudes, subtract angles: 0° − (−21°) = +21°.

### 11.6 Second order: critical R, resonance, governing equation
- **Spring 2024 #1a (parallel RLC, 4 µF, 2.5 mH):** R = ½√(L/C) = ½√(625) = **12.5 Ω** ✓; f₀ = 1/(2π√(LC)) = **1.59 kHz** ✓.
- **Spring 2022 #1b:** 15 V, 3 kΩ, 3 kΩ shunt, then series 100 nF and 100 mH. Thévenin to the LC: 1.5 kΩ. Series RLC: α = 1500/0.2 = 7500 s⁻¹, ω₀ = 1/√(1e-8) = 10,000 rad/s. α < ω₀ → **underdamped** ✓.
- **Spring 2023 #1b (L from V_s to node V; R and C from V to ground):** KCL at V: (1/L)∫(V_s − V)dt = V/R + C dV/dt. Differentiate: V″ + (1/RC)V′ + V/(LC) = V_s/(LC). **α = 1/(2RC), ω₀ = 1/√(LC), f(t) = V_s(t)/(LC).**
- **Fall 2023 #3 (2 A source ∥ C ∥ L, switch adds R to a 10 V source):** before: C open, L short: **V_C = 0, i_L = 2 A**. KCL with V_C = L di_L/dt: LC i_L″ + (L/R)i_L′ + i_L = 2 + 10/R. Particular (DC) solution: **i_Lp = 2 + 10/2 = 7 A**. α = 1/(2RC) = 250,000, ω₀ = 10⁶, ζ = 0.25 → **underdamped** ✓.

Governing-equation recipe: pick the node or loop; write KCL/KVL with i_C = C dv/dt and v_L = L di/dt (use ∫ for the other); differentiate to remove integrals; divide by the coefficient of the second derivative; match to x″ + 2αx′ + ω₀²x = f(t). The particular solution for a DC forcing is x_p = f/ω₀² (the DC steady-state value).

### 11.7 Phasor circuits with a hidden resonance (Fall 2025 #2)
I_s = 1cos(50t) A into 200 Ω then L₁ = 4 H to ground at node V_a; V_a → 100 Ω → L₂ = 1 H ∥ C₁ to ground. Given: no current in the 100 Ω for all time.
- No current in the 100 Ω → no voltage across it → the L₂ ∥ C₁ node also sits at V_a, and i₂ + i₃ = 0. All of I_s goes through L₁: **i₁ = 1∠0° A**.
- V_a = j(50)(4)(1) = **200∠90° V**. i₂ = V_a/(j50) = **4∠0° A**, i₃ = **−4∠0° A** ✓.
- i₂ + i₃ = 0 means L₂ and C₁ are at resonance: ω² = 1/(L₂C₁) → **C₁ = 1/(2500 × 1) = 0.0004 F** ✓.

### 11.8 Series L–R–C with a sine source (Fall 2023 #1b)
V_in = 1sin(10⁵t) = 1∠−90° V; Z_L = j200, R = 100, Z_C = 1/(j·10⁵·10⁻⁷) = −j100. Total Z = 100 + j100 = 141.4∠45°.
- i = 1∠−90°/141.4∠45° = **7.07∠−135° mA** ✓.
- V₁ (after L) = i(R + Z_C) = **1∠180° = −1 V** ✓. V₂ (across C) = i(−j100) = **0.707∠135° V** ✓.

### 11.9 Phasor nodal and mesh with dependent sources (Spring 2024 #3, Spring 2023 #2, Spring 2022 #2)
- Convert every element to Z at the source ω. Write the controlling variable of each dependent source (0.02V₂, 10i₁, 0.2V_o) in terms of the unknown node voltages or mesh currents, then substitute.
- Nodal: one KCL per unknown node, (V_a − V_b)/Z. A dependent current source enters KCL as its expression. A dependent voltage source between nodes → supernode.
- Mesh: one KVL per mesh; a current source on an outer branch fixes that mesh current; a shared current source → supermesh.
- Mixed sin and cos sources at the same ω: convert both to +cos phasors (0.1sin(10t) = 0.1∠−90°).
- Posted answers: Spring 2024 #3 (V_in = 5cos(10⁴t)): **V₁ = 2.34∠−47.3° V, V₂ = 1.17∠50° V**. Spring 2023 #2 (V_s = 5cos(10⁴t)): **i₁ = 0, i₂ = 0.05∠−90° A, i₃ = 0.035∠−135° A, V₂ = 1.77∠135° V**.
- Norton by nodal (Spring 2022 #2): find V_oc at a–b by nodal, then short a–b and find I_sc by nodal; Z_N = V_oc/I_sc. With a dependent source, never kill it.

### 11.10 Diodes: both assumptions with justification
**Spring 2026 #4:** 12 V → D1 → node A; 820 Ω A to ground; 150 Ω A to B; 1 kΩ B to ground; D2 anode at B, cathode at the 12 V rail. FBV 0.7 V.
- D1 on, D2 off: V_A = 11.3 V. i_R2 = 11.3/820 = 13.78 mA; i_R1 = i_R3 = 11.3/1150 = **9.82 mA**; **i_D1 = 23.6 mA**, **i_D2 = 0** ✓.
- Check D1: i_D1 = 23.6 mA > 0 ✓. Check D2: V_B = 9.82 V, v_AK = 9.82 − 12 = −2.17 V < 0.7 V → off ✓.

**Fall 2025 #3:** 10 V → D1 → 50 Ω → node N; 220 Ω N to ground; D2 from the 8 V source into N (anode at 8 V).
- (a) D1 on, D2 off: I₁ = (10 − 0.7)/270 = **34.4 mA**, V_N = 7.58 V, **V_D2 = 8 − 7.58 = 0.42 V** < 0.7 → off ✓. I₂ = 0, V_D1 = 0.7 V.
- (b) D1 off, D2 on: I₂ = (8 − 0.7)/220 = **33.2 mA**, V_N = 7.3 V, **V_D1 = 10 − 7.3 = 2.7 V** > 0.7 → D1 would conduct ✗.
- **(a) is correct**, because in (b) the "off" diode would have 2.7 V forward across it.

### 11.11 Diode tables and transfer characteristics (Spring 2024 #2, Fall 2023 #2, Spring 2023 #3, Spring 2022 #3)
Procedure for V_out vs V_in:
1. Find the **breakpoints**: the V_in at which each diode just turns on (its v_AK reaches FBV) or a Zener just breaks down (reaches BDV).
2. Between breakpoints every diode has a fixed state. Replace each with its model (FBV source or open) and solve the linear circuit: V_out = (slope)V_in + (intercept).
3. Check each region's assumed states at one V_in inside it.
4. For a table, plug each V_in into the matching region. Explain at the extreme values which diodes conduct and why.
- Spring 2024 #2 key (FBV 0.7): −5 < V_in < −0.7: slope 2/3, V_out = (2/3)(V_in + 0.7); −0.7 < V_in < 0.7: V_out = 0; 0.7 < V_in < 5: slope 1, V_out = V_in − 0.7.
- Spring 2023 #3 key (FBV 1.0 V, 2 V Zener): (V_in; V₁, V₂) = (5; 2.33, 1), (3; 1.66, 1), (1; 1, 1), (−4; −3, −2), (−5; −3.5, −2).
- A Zener in a table: positive side often clamps at its FBV (forward), negative side at −BDV (breakdown), or the reverse depending on orientation.

---

## 12. Conceptual short-answer bank

- **Which phasor leads?** The one with the larger angle in the same +cos form. In an inductor, voltage leads current by 90°; in a capacitor, current leads voltage by 90°.
- **Impedance of L at DC / high frequency:** 0 / ∞. Capacitor: ∞ / 0.
- **Average power in a pure inductor or capacitor:** zero. Only resistance absorbs average power.
- **Power factor lagging** means inductive load, current lags voltage, θ > 0.
- **Why can't you add phasors at different frequencies?** The ω was dropped assuming it is common; with two ω values the rotating vectors do not keep a fixed angle.
- **Effect of increasing R in series RLC:** α increases; moves from underdamped toward overdamped; ringing decays faster.
- **Effect of increasing C in series RLC:** ω₀ decreases, R_crit decreases.
- **Undamped condition:** R = 0 in series RLC; oscillates forever at ω₀.
- **Diode forward drop with temperature or current:** current grows exponentially with v_D; each 60 mV is about 10× current (n = 1).
- **Bigger filter capacitor:** less ripple, larger charging current spikes.
- **RMS of 120 V household voltage:** 120 V is the RMS value; peak is 170 V.
- **Inductor current graph with a jump:** impossible. Capacitor voltage with a jump: impossible.
- **The complementary solution dies out** because its exponentials decay with α > 0 (or 1/τ > 0); the forced sinusoid remains.

---

## 13. Verification protocol

Run at least one check per answer and show it.

1. **Second order:** x(0) and x′(0) reproduce the initial conditions; x(∞) matches the DC answer; s₁ + s₂ = −2α and s₁s₂ = ω₀².
2. **Phasor KVL/KCL:** element phasor voltages around a loop sum to zero in rectangular form; currents at a node sum to zero.
3. **Power conservation:** Σ P delivered = Σ P absorbed; Σ Q also balances.
4. **Impedance sanity:** |Z| of a parallel combination is not larger than the largest branch for like elements; Z_in angle between −90° and +90° for a passive network.
5. **Phase sanity:** inductor current lags its voltage by exactly 90°, capacitor current leads by 90°.
6. **Diodes:** every assumed state is checked (current sign for on and breakdown, voltage range for off). Exactly one state survives.
7. **Load line:** the Q point satisfies both the line and the Shockley equation to 3 significant figures.
8. **First order:** at t = 0 and t → ∞ the formula reproduces the stated initial and final values.
9. **Units:** ω in rad/s inside every jωL and 1/(jωC); farads and henries in base units.

---

## 14. Error checklist

| Symptom | Likely cause |
|---|---|
| Phasor angle off by 180° | atan of a negative real part without adding 180° |
| Phasor angle off by 90° | sin not converted to cos first, or converted the wrong way |
| v(t) at a time is wrong | ωt left in radians while φ was in degrees |
| Impedance magnitude 6.28× off | used f instead of ω |
| Capacitor impedance has the wrong sign | 1/j = −j, so Z_C = −j/(ωC) |
| Power off by 2× | mixed peak phasors with the RMS formula |
| Superposition with two ω gives a single phasor | phasors of different frequencies were added |
| 2nd-order constants wrong | used x(0) instead of x(0) − x(∞), or wrong x′(0) |
| Damping case wrong | used the t < 0 circuit, or series formula on a parallel RLC |
| Diode answer has a negative forward current | wrong state; try the next combination |
| Zener treated as a forward diode in reverse | reverse current at BDV only flows cathode to anode |
| V_T wrong | temperature not converted to kelvin |
| Lab ringing frequency lower than predicted | generator 50 Ω and coil resistance ignored |
| Lab voltages far from calculated | a resistor 10× off (47 Ω vs 470 Ω: third band black vs brown) |
| Z element type answered with only one option | positive angle fits R–L series AND R–L parallel |
| τ includes a resistor that leads to an open switch | that resistor carries no current after switching; drop it |
| Load line slope compared backwards | steeper line = larger current intercept = smaller R |
| Diode table region wrong | breakpoints not found first; check one point per region |
| Dependent source killed in phasor Thévenin/Norton | never kill dependent sources; use V_oc/I_sc or a test source |
