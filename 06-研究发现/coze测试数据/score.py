#!/usr/bin/env python3
"""汇总 labels.csv 里的逐条评分，生成 metrics.md。"""

import argparse
import csv
import math
import statistics
from pathlib import Path

BOOL_COLUMNS = [
    "intent_ok",
    "event_level_ok",
    "time_ok",
    "location_ok",
    "type_ok",
    "priority_ok",
    "estimate_ok",
    "dependency_ok",
]


def parse_bool(value):
    v = (value or "").strip().upper()
    if v in {"TRUE", "1", "YES", "Y", "是"}:
        return True
    if v in {"FALSE", "0", "NO", "N", "否"}:
        return False
    return None


def percentile(values, q):
    """线性插值分位数；values 不需要预先排序。"""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * q
    low = math.floor(pos)
    high = math.ceil(pos)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="labels.csv")
    parser.add_argument("--out", help="输出 metrics.md，默认与输入同目录")
    args = parser.parse_args()

    path = Path(args.input)
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    rows = [
        r for r in rows
        if (r.get("predicted_events") or "").strip()
        and "待运行" not in (r.get("predicted_events") or "")
    ]

    lines = [f"# 抽取测试结果：{path.name}", ""]
    lines.append(f"- 已运行：{len(rows)} 条")

    if not rows:
        lines.append("")
        lines.append("还没有填 `predicted_events`。先跑 Coze/LLM，再评分。")
    else:
        lines.append("")
        lines.append("| 指标 | 正确 | 有效 | 准确率 |")
        lines.append("|---|---:|---:|---:|")
        for col in BOOL_COLUMNS:
            values = [parse_bool(r.get(col)) for r in rows]
            values = [v for v in values if v is not None]
            correct = sum(1 for v in values if v)
            rate = f"{correct / len(values) * 100:.1f}%" if values else "N/A"
            lines.append(f"| {col} | {correct} | {len(values)} | {rate} |")

        hallucinations = [parse_bool(r.get("hallucination")) for r in rows]
        hallucinations = [v for v in hallucinations if v is not None]
        if hallucinations:
            bad = sum(1 for v in hallucinations if v)
            rate = bad / len(hallucinations) * 100
            lines.append(
                f"| hallucination（有幻觉的条数） | {bad} | {len(hallucinations)} | {rate:.1f}% |"
            )

        latencies = []
        for r in rows:
            for col in ("latency_ms", "latency_ms_run2", "latency_ms_run3"):
                raw = (r.get(col) or "").strip()
                if not raw:
                    continue
                try:
                    latencies.append(float(raw))
                except ValueError:
                    pass
        if latencies:
            average = sum(latencies) / len(latencies)
            median = statistics.median(latencies)
            p95 = percentile(latencies, 0.95)
            lines.append(f"| latency_ms（平均） |  |  | {average:.0f} ms |")
            lines.append(f"| latency_ms（中位） |  |  | {median:.0f} ms |")
            lines.append(f"| latency_ms（p95） |  |  | {p95:.0f} ms |")
            lines.append(f"| latency_ms（最大） |  |  | {max(latencies):.0f} ms |")
            lines.append(f"| 延迟样本数 |  |  | {len(latencies)} |")

        lines.extend(["", "## 逐条备注", ""])
        for r in rows:
            note = (r.get("notes") or "").strip()
            lines.append(f"- id {r.get('id')}：{note or '（无）'}")

    out = Path(args.out) if args.out else path.parent / "metrics.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"写出 {out}")


if __name__ == "__main__":
    main()
