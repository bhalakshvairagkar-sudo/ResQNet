"""
ResQNet Bayesian Multi-Source Confidence Fusion Engine.
Formula: C_fused = 1 - Product(1 - c_i) for i in sources
"""

import math

def fuse_confidence(sources):
    """
    Computes fused Bayesian probability across independent observation channels.
    sources: list of floats between 0.0 and 1.0 (or dicts with 'confidence')
    """
    if not sources:
        return 0.0

    scores = []
    for s in sources:
        if isinstance(s, dict):
            val = s.get("confidence", s.get("confidenceScore", 0.0))
            if val > 1.0:
                val = val / 100.0
            scores.append(val)
        elif isinstance(s, (int, float)):
            val = s if s <= 1.0 else s / 100.0
            scores.append(val)

    if not scores:
        return 0.0

    unconfidence = 1.0
    for c in scores:
        unconfidence *= (1.0 - max(0.0, min(0.99, c)))

    fused = 1.0 - unconfidence
    return round(fused, 4)

def calculate_severity(g_force, speed_delta_kmh, rollover=False, patients=1):
    """
    Calculates 0-100 Polytrauma Severity Score
    """
    g_score = min(40, (g_force / 6.0) * 40) if g_force else 15
    delta_v_score = min(30, (speed_delta_kmh / 80.0) * 30) if speed_delta_kmh else 15
    rollover_score = 20 if rollover else 0
    patient_score = min(10, patients * 5)

    total_severity = min(100, int(g_score + delta_v_score + rollover_score + patient_score))
    return total_severity

if __name__ == "__main__":
    sources = [{"source": "smartphone", "confidence": 0.87}, {"source": "cctv", "confidence": 0.92}]
    fused = fuse_confidence(sources)
    sev = calculate_severity(g_force=5.2, speed_delta_kmh=60, rollover=True, patients=2)
    print(f"Fused Bayesian Confidence: {fused * 100:.2f}%")
    print(f"Estimated Polytrauma Severity: {sev}/100")
