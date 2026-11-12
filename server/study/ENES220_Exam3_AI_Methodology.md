# ENES 220 Exam #3: Solving Methodology for an AI Model

Exam 3 topics:
1. Beam deformation (double integration with singularity functions, and the deflection tables)
2. Statically indeterminate beams (method of superposition)
3. Statically indeterminate rods and shafts (axial, torsion, thermal)

---

## 0. Operating Rules (read first, obey always)

1. **Allowed tools only.** Use ONLY:
   - The formulas in Section 1 (copied from the official Exam #3 equation sheet).
   - The deflection tables in Section 1.4 (also on the sheet).
   - Static equilibrium (ΣF = 0, ΣM = 0, ΣT = 0).
   - Geometry of deformation (compatibility) written by you from the figure.
   - Unit conversions and algebra.
2. **Do NOT use** formulas that are not on the sheet. Examples of forbidden shortcuts: moment-area theorems, conjugate beam, three-moment equation, Castigliano, memorized deflection results not in the table, "stiffness k = AE/L" shortcuts written as springs (allowed only if you rewrite them as δ = PL/AE first).
3. **Method named in the problem is mandatory.** If it says "Method of Superposition", use the tables + compatibility. If it says "elastic curve equation" or "C1 and C2", use double integration.
4. **Material properties** come ONLY from the problem statement. If E, G, α, or I is missing, stop and ask.
5. **Show every step:** FBD and reactions, M(x), integration, boundary conditions, constants, substitution, final answer with units and sense.
6. **Units:** pick one system before computing.
   - SI: N, mm, MPa (N/mm²), or kN, m, kN·m. EI in kN·m² when x is in m and loads in kN.
   - US: lb, in, psi; or lb, ft for M(x) then convert. If y(x) is built in lb·ft³, convert to inches with y(in) = [value in lb·ft³] × 1728 / EI(lb·in²).
   - Slopes come out in radians. Convert to degrees with × 180/π.
   - GPa to Pa: × 10⁹. mm⁴ to m⁴: × 10⁻¹².
7. **Sign conventions (sheet and answer key):**
   - y positive UP. Downward deflection is negative.
   - Slope y′ = dy/dx, positive when the beam rises to the right.
   - Internal M positive = sagging (compression on top).
   - Tension positive, compression negative for axial stress. State "(T)" or "(C)".
   - Torques: state direction (CW/CCW) or use a consistent right-hand rule along the shaft axis.
8. **"Magnitude and sense"** means |value| plus T/C (stress), up/down (deflection), CW/CCW (rotation or moment).

---

## 1. Allowed Formulas (verbatim from the equation sheet)

### 1.1 Beam deformation

| Formula | Meaning |
|---|---|
| d²y/dx² = M(x)/EI_z | Curvature from moment |
| EI_z d²y/dx² = M(x) | Same, multiplied out |
| d³y/dx³ = V(x)/EI_z | Shear relation |
| d⁴y/dx⁴ = −q(x)/EI_z | Load relation |
| EI_z dy/dx = ∫ M(x) dx + C₁ | First integration (slope) |
| EI_z y = ∬ M(x) dx dx + C₁x + C₂ | Second integration (deflection) |

### 1.2 Singularity-function moment terms (table on the sheet)

Each load at position x = a, written for the beam segment to the LEFT of the cut:

| Load | Term in M(x) |
|---|---|
| Concentrated moment M₀ at a (drawn counterclockwise on sheet) | −M₀⟨x − a⟩⁰ |
| Concentrated force F downward at a | −F⟨x − a⟩¹ |
| Uniform load q₀ downward starting at a | −(q₀/2)⟨x − a⟩² |
| Linearly increasing load, 0 at a rising to q₀ over length b | −(q₀/6b)⟨x − a⟩³ |

Rules that follow from the table (same convention, reversed directions):
- Upward force R at a (a support reaction): +R⟨x − a⟩¹.
- Clockwise applied moment M₀ at a: +M₀⟨x − a⟩⁰. Counterclockwise: −M₀⟨x − a⟩⁰.
- Fixed-wall reaction moment at x = 0: include it as a moment term at a = 0 with the sign rule above.
- ⟨x − a⟩ⁿ = 0 when x < a, and (x − a)ⁿ when x ≥ a.
- Integration: ∫⟨x − a⟩ⁿ dx = ⟨x − a⟩ⁿ⁺¹/(n + 1).

**Boundary conditions (from the sheet's support pictures):**

| Support | Conditions |
|---|---|
| Pin and clevis | M = 0, y = 0, dy/dx ≠ 0 |
| Roller | M = 0, y = 0, dy/dx ≠ 0 |
| Built-in (fixed wall) | M ≠ 0, y = 0, dy/dx = 0 |

### 1.3 Statically indeterminate members

| Formula | Meaning |
|---|---|
| σ = P/A | Axial stress |
| δ = PL/AE | Axial deformation from load |
| A = π(r_o² − r_i²) = π(d_o² − d_i²)/4 | Area (solid: r_i = 0) |
| τ_ro = T r_o / J | Torsional shear stress at outer radius |
| φ = TL/JG | Angle of twist |
| J = π(r_o⁴ − r_i⁴)/2 = π(d_o⁴ − d_i⁴)/32 | Polar moment |
| σ_c = Mc/I_z | Bending stress |
| I_z = bh³/12 ; I_z = π(r_o⁴ − r_i⁴)/4 = π(d_o⁴ − d_i⁴)/64 | Moments of inertia |
| ΔT = T_f − T_i | Temperature change |
| δ_T = α(ΔT)L | Free thermal deformation |
| ε_T = α(ΔT) | Thermal strain |
| σ_T = Eα(ΔT) | Thermal stress, fully restrained member |

### 1.4 Deflection tables (y up positive; all loads drawn DOWNWARD; length L; EI = EI_z)

**Simply supported beams (pin at A, x = 0; roller at B, x = L):**

| Case | Slope | Deflection |
|---|---|---|
| S1. Force F at midspan | (dy/dx)_max = −FL²/16EI (at ends) | y = −Fx(3L² − 4x²)/48EI, 0 ≤ x ≤ L/2; y_max = −FL³/48EI |
| S2. Force F at distance a from A, b from B | (dy/dx)_A = −Fab(L + b)/6EIL; (dy/dx)_B = Fab(L + a)/6EIL | y = −Fbx(L² − b² − x²)/6EIL, 0 ≤ x ≤ a; y at x = a: −Fba(L² − b² − a²)/6EIL |
| S3. Moment M at end A | (dy/dx)_A = −ML/3EI; (dy/dx)_B = ML/6EI | y = −Mx(x² − 3Lx + 2L²)/6EIL; y_max = −ML²/(√243 EI) at x = 0.4226L |
| S4. Uniform q₀ over full span | (dy/dx)_max = −q₀L³/24EI | y = −q₀x(x³ − 2Lx² + L³)/24EI; y_max = −5q₀L⁴/384EI |
| S5. Uniform q₀ on half span next to A | (dy/dx)_A = −3q₀L³/128EI; (dy/dx)_B = 7q₀L³/384EI | y = −q₀x(16x³ − 24Lx² + 9L³)/384EI, 0 ≤ x ≤ L/2; y = −q₀L(8x³ − 24Lx² + 17L²x − L³)/384EI, L/2 ≤ x ≤ L; y_max = −6.563×10⁻³ q₀L⁴/EI at x = 0.4598L |
| S6. Triangular load, 0 at A rising to q₀ at B | (dy/dx)_A = −7q₀L³/360EI; (dy/dx)_B = q₀L³/45EI | y = −q₀x(3x⁴ − 10L²x² + 7L⁴)/360EIL; y_max = −6.52×10⁻³ q₀L⁴/EI at x = 0.5193L |

**Cantilever beams (fixed at x = 0, free at x = L):**

| Case | Slope at free end | Deflection |
|---|---|---|
| C1. Force F at free end | −FL²/2EI | y = −Fx²(3L − x)/6EI; y_max = −FL³/3EI |
| C2. Force F at L/2 | −FL²/8EI | y = −Fx²(3L/2 − x)/6EI, 0 ≤ x ≤ L/2; y = −FL²(3x − L/2)/24EI, L/2 ≤ x ≤ L |
| C3. Uniform q₀ over full length | −q₀L³/6EI | y = −q₀x²(x² − 4Lx + 6L²)/24EI; y_max = −q₀L⁴/8EI |
| C4. Moment M₀ at free end (as drawn on sheet) | ML/EI | y = Mx²/2EI; y_max = ML²/2EI |
| C5. Uniform q₀ on half next to the wall | −q₀L³/48EI | y = −q₀x²(x² − 2Lx + 3L²/2)/24EI, 0 ≤ x ≤ L/2; y = −q₀L³(4x − L/2)/192EI, L/2 ≤ x ≤ L |
| C6. Triangular, q₀ at wall decreasing to 0 at free end | −q₀L³/24EI | y = −q₀x²(10L³ − 10L²x + 5Lx² − x³)/120EIL; y_max = −q₀L⁴/30EI |

Table rules:
- An upward load is the same formula with the opposite sign.
- A load case not in the table must be built by superposing table cases, or solved by double integration (Section 2.1). Do not invent a table formula.
- Cantilever with a load that ends before the tip: the part of the beam beyond the load is straight. y_tip = y_load_end + θ_load_end × (remaining length).

---

## 2. Methodologies by Problem Type

### 2.1 Elastic curve by double integration (singularity functions)

Use when the problem asks for an elastic curve equation, C₁ and C₂, or deflection/slope "by integration".

1. **Coordinates:** origin where the problem says (usually the left end). x increases to the right, y up.
2. **Reactions:** draw the FBD, solve ΣF_y = 0 and ΣM = 0. For a cantilever, the wall gives a force and a moment.
3. **Write one M(x) for the whole beam** using Section 1.2, one term per reaction and load, each with its own ⟨x − a⟩ⁿ.
   - **Distributed load that stops before the end of the beam:** singularity terms continue forever, so cancel the load where it ends:
     - Uniform q₀ from a to c: −(q₀/2)⟨x − a⟩² + (q₀/2)⟨x − c⟩².
     - Triangle rising 0 → q₀ from a to c (b = c − a): −(q₀/6b)⟨x − a⟩³ + (q₀/6b)⟨x − c⟩³ + (q₀/2)⟨x − c⟩².
     - Triangle falling q₀ → 0 from a to c: write it as uniform q₀ from a to c MINUS a rising triangle from a to c, then apply the cancel rules above.
   - **Load that runs to the end of the beam:** no cancel terms needed (terms past the tip never act).
4. **Integrate twice:** EIy′ = ∫M dx + C₁, then EIy = ∬M dx dx + C₁x + C₂.
5. **Boundary conditions** (Section 1.2 table):
   - Pin + roller at x = 0 and x = L: y(0) = 0 → C₂ = 0 (if origin at the pin); y(L) = 0 → solve C₁.
   - Fixed wall at x = 0: y(0) = 0 → C₂ = 0; y′(0) = 0 → C₁ = 0.
   - Never use dy/dx = 0 at a pin or roller.
6. **Write the final elastic curve** with C₁ and C₂ filled in, in the form y(x) = (1/EI)[ ... ] with units (kN·m³ or lb·ft³).
7. **Evaluate** y and y′ at the requested points. Convert EI and lengths to consistent units, then convert slope to degrees.
8. **Check:** y = 0 at every pin, roller, and wall; y′ = 0 at a wall.

### 2.2 Deflection or slope at a point by the tables (superposition, determinate beam)

1. Split the loading into table cases S1 to S6 or C1 to C6, each with its own L, a, b, q₀.
2. Write y (or y′) at the point for each case. Flip the sign for any upward load or reversed moment.
3. Add them. Report magnitude and direction.

### 2.3 Statically indeterminate beams (Method of Superposition)

1. **Count unknowns.** Supports give more reactions than equilibrium equations. The number extra = the number of redundants (usually 1, sometimes 2).
2. **Choose the redundant(s):** usually a middle or end roller force (e.g., B_y), or the fixed-end moment.
3. **Released beam:** remove the redundant so the beam becomes a table case (simply supported or cantilever).
4. **Case 1, actual loads on the released beam:** find y (or θ) at the redundant's location from the tables.
5. **Case 2, redundant alone as an upward force (or moment) on the released beam:** find y (or θ) at the same point in terms of the unknown.
6. **Compatibility equation** at the redundant:
   - Support with no gap: y_case1 + y_case2 = 0.
   - Support with a gap Δ below the beam: y_case1 + y_case2 = −Δ (beam moves down exactly Δ to touch the support).
   - Fixed end chosen as the redundant moment: θ_case1 + θ_case2 = 0.
7. **Solve** for the redundant. EI often cancels when there is no gap. With a gap, EI does NOT cancel: keep units consistent.
8. **Remaining reactions from statics** (ΣF_y = 0, ΣM = 0).
9. **Checks:** a negative redundant means it acts opposite to the assumed direction (Problem 4 in the key has B_y negative). State the final direction.
10. **Two redundants:** write two compatibility equations, one at each removed support, each including both redundants' effects at that point (S2 gives the effect at any point x ≤ a; use symmetry by measuring x from B when x > a).

### 2.4 Statically indeterminate axial members (rods, bars, composite sections)

1. **FBD and equilibrium:** write ΣF = 0 relating the member forces and reactions. Assume every internal force is tension; a negative result means compression.
2. **Identify the configuration and write compatibility:**
   - **Series between rigid walls (no gap):** δ₁ + δ₂ + ... = 0.
   - **Series with a gap Δ that closes:** δ₁ + δ₂ + ... = Δ (total elongation equals the gap).
   - **Parallel / bonded / concentric (core and shell, cord and sheath):** δ₁ = δ₂ (equal deformation, equal length so equal strain: σ₁/E₁ = σ₂/E₂ for mechanical load).
   - **Rigid bar pinned at one point, held by rods:** points on the bar move proportional to distance from the pin: δ_B / d_B = δ_C / d_C. Then relate each rod's elongation (positive = stretched) to that point's displacement, minding whether the bar movement stretches or shortens each rod.
3. **Force-deformation, including temperature:** δ_i = P_i L_i/(A_i E_i) + α_i(ΔT)L_i.
4. **Solve** equilibrium + compatibility together.
5. **Stresses:** σ = P/A. Report (T) or (C).
6. **Allowable-load problems:** solve with each stress limit as the trigger; the smallest load governs. Check the other material stays within its limit.
7. **Thermal only, fully restrained single member:** σ_T = Eα(ΔT) (compressive for heating).
8. **Thermal with a gap:** first check if free expansion α(ΔT)L closes the gap. If yes, the overlap beyond the gap is what creates stress.

### 2.5 Statically indeterminate torsion (shafts)

1. **Equilibrium:** sum of torques = 0. Example: shaft fixed at both ends with an applied torque T: T_A + T_B = T.
2. **Compatibility:**
   - **Shaft fixed at both ends, load in the middle:** twist of the left part = twist of the right part, i.e. total twist end to end = 0.
   - **Stepped segments in series on one side:** φ_side = Σ T_i L_i/(J_i G_i), with the same internal torque in each segment on that side.
   - **Concentric shaft and tube joined by a rigid plate:** both twist the same angle: φ₁ = φ₂.
3. **Twist:** φ = TL/JG for each segment, with J from Section 1.3 (tube: use d_o and d_i = d_o − 2t).
4. **Solve** for the torques.
5. **Shear stress:** τ = T r_o / J in EACH segment. The maximum may be in a small-diameter segment carrying less torque. Compare all segments.
6. **Allowable torque:** compute T from each material's τ limit (τ_allow × J / r_o for that member, then convert to the total applied T using the torque split). The smallest governs.

---

## 3. Common Pitfalls Checklist

- [ ] Every load and reaction appears in M(x), each with the correct ⟨x − a⟩ power.
- [ ] Distributed loads that stop before the end have cancel terms.
- [ ] Applied moment sign: CW → +M₀⟨x − a⟩⁰, CCW → −M₀⟨x − a⟩⁰.
- [ ] No slope = 0 condition at a pin or roller.
- [ ] EI in matching units; ft³ to in³ conversion (× 1728) when needed.
- [ ] Slope converted to degrees.
- [ ] Superposition: the table case geometry (a, b, L) matches the released beam, and upward redundants flip sign.
- [ ] Gap problems: compatibility equals the gap, not zero, and EI does not cancel.
- [ ] Axial: tension assumed positive; thermal term included in every heated member.
- [ ] Torsion: max shear checked in every segment, not just the one with the largest torque.
- [ ] Every reaction has a stated direction.

---

## 4. Worked Reference Examples (each matches the official answer key)

### Example A: Cantilever with a partial triangular load (Beam Deformation #1)
Fixed at A (x = 0). Triangular load 9 kN/m at C (x = 2 m) decreasing to 0 at B (x = 6 m). EI = (200 × 10⁹)(150 × 10⁻⁶) = 30,000 kN·m².

1. Resultant = ½(9)(4) = 18 kN at x = 2 + 4/3 = 3.333 m. Wall: A_y = 18 kN up, M_A = 18(3.333) = 60 kN·m (CCW on the beam).
2. M(x) = −60 + 18x − (9/2)⟨x − 2⟩² + (9/24)⟨x − 2⟩³
   (falling triangle = uniform 9 minus rising triangle with b = 4; load runs to the tip so no cancel terms).
3. EIy′ = −60x + 9x² − 1.5⟨x − 2⟩³ + (9/96)⟨x − 2⟩⁴ + C₁
   EIy = −30x² + 3x³ − 0.375⟨x − 2⟩⁴ + (9/480)⟨x − 2⟩⁵ + C₁x + C₂
4. Fixed at x = 0: y′(0) = 0 → C₁ = 0; y(0) = 0 → C₂ = 0.
5. At x = 6: EIy′ = −360 + 324 − 96 + 24 = −108 → y′_B = −0.0036 rad = **−0.2063°**.
   EIy = −1080 + 648 − 96 + 19.2 = −508.8 → y_B = −0.01696 m = **−16.96 mm**.

### Example B: Indeterminate beam by superposition (Indeterminate Beams #3)
Uniform w = 1 kN/m on L = 12 m. Roller A (x = 0), roller B (x = 8), pin C (x = 12). One redundant: B_y.

1. Released beam: simply supported A to C.
2. Case 1, uniform load (S4) at x = 8: y = −(1)(8)(512 − 1536 + 1728)/24EI = −234.67/EI.
3. Case 2, upward B_y at a = 8, b = 4 (S2 at x = a, sign flipped): y = +B_y(4)(8)(144 − 16 − 64)/(6 × 12 × EI) = +28.444 B_y/EI.
4. Compatibility (no gap): −234.67 + 28.444 B_y = 0 → **B_y = 8.25 kN**.
5. Statics: ΣM_C = 0: A_y(12) + 8.25(4) − 12(6) = 0 → **A_y = 3.25 kN**; C_y = 12 − 3.25 − 8.25 = **0.5 kN**.

### Example C: Concentric axial members (Rods & Shafts #1)
Cord d = 3 mm (E_c = 7 GPa, limit 15 MPa) inside a 0.5 mm sheath (E_s = 14 GPa, limit 56 MPa).

1. A_c = π(1.5)² = 7.069 mm²; A_s = π(2² − 1.5²) = 5.498 mm².
2. Bonded, same strain: σ_s/E_s = σ_c/E_c → σ_s = 2σ_c.
3. Cord limit 15 MPa → sheath 30 MPa (below 56, OK). Sheath limit 56 → cord 28 (above 15, not OK). Cord governs.
4. P = 15(7.069) + 30(5.498) = **270.9 N**, σ_c = **15 MPa**, σ_s = **30 MPa**.

### Example D: Shaft fixed at both ends (Rods & Shafts #3)
AC: d = 0.5 in, 5 in long. CD: d = 1 in, 8 in. DB: d = 1 in, 12 in. T = 500 lb·ft at D. G cancels.

1. J₁ = π(0.5)⁴/32 = 0.006136 in⁴; J₂ = π(1)⁴/32 = 0.09817 in⁴.
2. Equilibrium: T_A + T_B = 500. Compatibility: φ_AD = φ_DB:
   T_A(5/0.006136 + 8/0.09817) = T_B(12/0.09817) → 896.4 T_A = 122.2 T_B.
3. **T_A = 60 lb·ft, T_B = 440 lb·ft.**
4. τ_AC = (60 × 12)(0.25)/0.006136 = **29.34 ksi**. τ_DB = (440 × 12)(0.5)/0.09817 = 26.9 ksi. Max is in AC.

---

## 5. Official Answer Key (use to check the method on the practice set)

**Beam Deformation**
1. y_B = −16.96 mm, y′_B = −0.2063°
2. y_A = −32.03 mm, y′_A = 0.2254°
3. y(x) = (1/EI)[(558/6)x³ − (750/2)⟨x − 6⟩² − (800/6)⟨x − 13⟩³ − (200/24)⟨x − 19⟩⁴ − 43,062x] lb·ft³; C₁ = −43,062 lb·ft², C₂ = 0; y_C = −2.153 in; y′_A = −1.184°
4. y(x) = (1/EI)[(700/6)x³ − (1400/840)x⁵ + (600/24)⟨x − 3⟩⁴ + (800/480)⟨x − 3⟩⁵ − (300/6)⟨x − 5⟩³ − 2,816x] lb·ft³; C₁ = −2,816 lb·ft², C₂ = 0; y_C = −1.469 in; y′_B = +3.728°
5. y(x) = (1/EI)[(1.8/6)x³ − (1.2/6)⟨x − 0.6⟩³ − (1.5/24)⟨x − 0.6⟩⁴ + (1.5/24)⟨x − 1.8⟩⁴ + (1.44/2)⟨x − 2.6⟩² − 1.364x] kN·m³; C₁ = −1.364 kN·m², C₂ = 0
6. y(x) = (1/EI)[−(258/2)x² + (52/6)x³ − (8/24)x⁴ + (50/2)⟨x − 5⟩² + (8/24)⟨x − 5⟩⁴] kN·m³; C₁ = 0, C₂ = 0

**Indeterminate Beams**
1. A_y = 24.75 kN, D_y = 29.25 kN, M_D = 81 kN·m (CW)
2. B_y = 20.25 kip, A_y = 1.75 kip, M_A = 5 kip·ft (CW)
3. A_y = 3.25 kN, B_y = 8.25 kN, C_y = 0.5 kN
4. A_y = 2M₀/L, B_y = −3M₀/L, C_y = M₀/L
5. A_y = 18.92 kN, B_y = 10.16 kN, C_y = 2.92 kN
6. B_y = 45.95 kip, A_y = 134.1 kip, M_A = 666.5 kip·ft (CCW)

**Indeterminate Rods & Shafts**
1. P = 270.9 N, σ_c = 15 MPa, σ_s = 30 MPa
2. σ_a = 17.26 ksi (T), σ_s = 14.22 ksi (C)
3. T_A = 60 lb·ft, T_B = 440 lb·ft, τ_max = 29.34 ksi (in AC)
4. T_max = 42.83 kip·in
5. σ_Al = 47.0 MPa (C), σ_St = 246.6 MPa (T)
6. T_f = 226°F, δ_AB = 0.00708 in (→)
7. σ_a = 8.571 ksi (T), σ_s = 12.86 ksi (T), θ = 0.04318° (CW)

---

## 6. Required Output Format for Each Answer

1. Given data with units, and the unit system chosen.
2. FBD description and reactions (or the redundant chosen and the released beam).
3. M(x) or the table cases used, with a, b, L for each.
4. Integration, boundary conditions, C₁ and C₂ (beam deformation) or compatibility equation (indeterminate).
5. Substitution and result for each requested quantity, with units.
6. Final answers bolded, with sense: up/down, CW/CCW, (T)/(C).
