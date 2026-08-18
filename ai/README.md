# ResQNet AI & Intelligence Module

This directory contains the algorithms and reference implementations powering the multi-source emergency decision engine.

---

## 1. Bayesian Multi-Source Confidence Fusion

Real-world emergency reports arrive asynchronously from noisy, independent sources. Rather than using naive averaging, ResQNet evaluates multi-source independence using Bayesian fusion:

$$C_{\text{fused}} = 1 - \prod_{i=1}^{n} (1 - c_i)$$

* **Single Channel (Phone IMU only, 87%)**: Fused Confidence = **87%**.
* **Dual Channel (Phone 87% + CCTV Vision 92%)**: Fused Confidence = $1 - (1 - 0.87)(1 - 0.92) =$ **98.96%**.

---

## 2. 0–100 Trauma Severity Index Formulation

$$\text{Severity} = \min\left(100, S_{\text{G-Force}} + S_{\Delta v} + S_{\text{Rollover}} + S_{\text{Occupants}}\right)$$

* $S_{\text{G-Force}} = \min\left(40, \frac{G}{6.0} \times 40\right)$
* $S_{\Delta v} = \min\left(30, \frac{\Delta v}{80} \times 30\right)$
* $S_{\text{Rollover}} = 20 \text{ if true else } 0$
* $S_{\text{Occupants}} = \min(10, N_{\text{patients}} \times 5)$

Severity $\ge 75$ immediately flags the incident as **Level-1 Polytrauma Critical**, mandating ALS ambulance allocation and Level-1 Trauma Hospital routing.
