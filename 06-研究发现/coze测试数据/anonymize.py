#!/usr/bin/env python3
"""把原始通知 CSV 脱敏成可测试的 labels.csv。

用法：
  python anonymize.py --raw "../coze-抽取测试记录.csv" --expected "v1/expected.csv" \
      --out "v1/labels.csv" --date 2026-10-18

映射优先级：
  1. --mapping-json '{"真实名称":"替换名"}'
  2. --mapping mapping.csv
  3. 同目录下的 mapping.csv
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent

REGEX_RULES = [
    (re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"), "[手机号]"),
    (re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)"), "[身份证号]"),
    (re.compile(r"(学号|工号)\s*[:：]?\s*\d{6,12}"), r"\1：[已脱敏]"),
    (re.compile(r"(QQ|qq)\s*[:：]?\s*\d{5,12}"), r"\1：[已脱敏]"),
    (re.compile(r"(微信|vx|VX|WeChat)\s*[:：]?\s*[A-Za-z0-9_-]{5,20}"), r"\1：[已脱敏]"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[邮箱]"),
    (re.compile(r"https?://\S+"), "[链接]"),
]

SCORE_COLUMNS = [
    "intent_ok",
    "event_level_ok",
    "time_ok",
    "location_ok",
    "type_ok",
    "priority_ok",
    "estimate_ok",
    "dependency_ok",
    "hallucination",
    "latency_ms",
]


def read_mapping_csv(path):
    mapping = {}
    with Path(path).open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            old = (row.get("original") or "").strip()
            if not old:
                continue
            mapping[old] = (row.get("replacement") or "[已脱敏]").strip()
    return mapping


def load_mapping(args):
    if args.mapping_json:
        mapping = json.loads(args.mapping_json)
        return {str(k): str(v) for k, v in mapping.items()}

    if args.mapping:
        path = Path(args.mapping)
        if not path.exists():
            sys.exit(f"找不到映射文件：{path}")
        return read_mapping_csv(path)

    default = BASE / "mapping.csv"
    if default.exists():
        return read_mapping_csv(default)

    print("提示：没有 mapping，姓名/群名/学校名/地点不会被替换。", file=sys.stderr)
    return {}


def load_expected(path):
    if not path:
        return {}
    with Path(path).open("r", encoding="utf-8-sig", newline="") as f:
        return {row["id"]: row for row in csv.DictReader(f) if row.get("id")}


def anonymize_text(text, mapping):
    count = 0
    for old, new in sorted(mapping.items(), key=lambda x: len(x[0]), reverse=True):
        count += text.count(old)
        text = text.replace(old, new)

    for pattern, replacement in REGEX_RULES:
        text, n = pattern.subn(replacement, text)
        count += n
    return text, count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", required=True, help="原始 CSV")
    parser.add_argument("--out", required=True, help="输出 labels.csv")
    parser.add_argument("--expected", help="expected.csv，按 id 合并标准答案")
    parser.add_argument("--mapping", help="mapping.csv 路径")
    parser.add_argument("--mapping-json", help="直接传 JSON 映射")
    parser.add_argument("--date", help="为空的 date 填测试基准日期")
    parser.add_argument("--force", action="store_true", help="覆盖已存在的输出")
    args = parser.parse_args()

    raw_path = Path(args.raw)
    out_path = Path(args.out)
    if out_path.exists() and not args.force:
        sys.exit(f"输出已存在：{out_path}；确认覆盖请加 --force")

    mapping = load_mapping(args)
    expected = load_expected(args.expected)

    with raw_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames
        raw_rows = list(reader)

    out_rows = []
    report = []
    leaks = []

    for row in raw_rows:
        text = (row.get("raw_text") or "").strip()
        if not text:
            continue

        notes = (row.get("notes") or "").strip()
        if "示例" in notes and "可删除" in notes:
            continue

        anon_text, count = anonymize_text(text, mapping)
        out = dict(row)
        out["raw_text"] = anon_text
        out["predicted_events"] = ""

        for col in SCORE_COLUMNS:
            out[col] = ""

        if args.date and not (out.get("date") or "").strip():
            out["date"] = args.date

        exp = expected.get(out.get("id") or "")
        if exp:
            for key, value in exp.items():
                if key == "id":
                    continue
                value = (value or "").strip()
                if not value:
                    continue
                if key == "notes":
                    base = (row.get("notes") or "").strip()
                    out["notes"] = f"{base}；{value}" if base else value
                else:
                    out[key] = value

        for old in mapping:
            if old in anon_text:
                leaks.append(f"{out.get('id')}: {old}")

        out_rows.append(out)
        report.append(f"{out.get('id')}: 替换 {count} 处")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(out_rows)

    report_path = out_path.parent / "redaction_report.txt"
    report_path.write_text("\n".join(report) + "\n", encoding="utf-8")

    print(f"完成：{len(out_rows)} 条 -> {out_path}")
    print(f"替换报告：{report_path}")
    if leaks:
        print("警告：脱敏后仍发现映射原词，请人工检查：", file=sys.stderr)
        for item in leaks:
            print(f"  - {item}", file=sys.stderr)
    print("请人工复核姓名、群名、学校名、老师名、地址；正则不能保证全覆盖。")


if __name__ == "__main__":
    main()
