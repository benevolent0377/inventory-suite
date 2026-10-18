def compute_urgency(status: str, shortage: float, required: float, order_overhead_days: float = 0) -> float:
    """Return a rational urgency value between 1.0 and 20.0.

    Urgency combines a status-based base with a fractional severity derived from
    the shortage and ordering overhead so values are genuinely rational rather
    than integers cast to float.
    """
    weights = {
        "out_of_stock": 4,
        "critical": 3,
        "low": 2,
        "not_tracked": 1,
        "healthy": 0,
        "out": 4,
        "ok": 0,
    }
    weight = weights.get(status, 0)
    base = weight * 5
    denominator = required if required > 0 else 10
    severity = min((shortage + order_overhead_days) / denominator, 0.99)
    if weight == 0:
        return float(min(20, max(1, 1 + severity)))
    return float(min(20, max(1, base + severity)))
