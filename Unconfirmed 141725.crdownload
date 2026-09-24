#!/usr/bin/env python3
"""مساعد محلي لمسار: تنظيم ومراجعة طلبات LinkedIn قبل التقديم اليدوي.

لا يملأ نماذج LinkedIn ولا يرسل الطلبات ولا يخزّن كلمات مرور. وظيفته هي
تسجيل الفرص، فتح رابط الإعلان الرسمي عند طلبك، ثم حفظ المرحلة التي أكّدتها بنفسك.

أمثلة:
  python3 masar_application_assistant.py add --title "Data Analyst" --company "Example" --url "https://www.linkedin.com/jobs/view/123"
  python3 masar_application_assistant.py list
  python3 masar_application_assistant.py open --id <APPLICATION_ID>
  python3 masar_application_assistant.py status --id <APPLICATION_ID> --value submitted
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
import webbrowser
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

QUEUE_PATH = Path.home() / ".masar_application_queue.json"
STATUSES = ("saved", "reviewing", "submitted", "interview", "closed")


def load_queue() -> list[dict]:
    """Load saved opportunities from the user's local profile only."""
    if not QUEUE_PATH.exists():
        return []
    try:
        value = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
        return value if isinstance(value, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def save_queue(items: list[dict]) -> None:
    """Write the queue atomically to avoid corrupting it on interruption."""
    temporary = QUEUE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(QUEUE_PATH)


def linkedin_url(value: str) -> str:
    """Allow only a LinkedIn URL; do not accept third-party submission endpoints."""
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or "linkedin.com" not in parsed.hostname:
        raise argparse.ArgumentTypeError("استخدم رابط إعلان من linkedin.com فقط.")
    return value.strip()


def find_item(items: list[dict], application_id: str) -> dict:
    for item in items:
        if item["id"] == application_id:
            return item
    raise SystemExit("لم يتم العثور على فرصة بهذا المعرّف. استخدم الأمر list لعرض المعرّفات.")


def command_add(args: argparse.Namespace) -> None:
    items = load_queue()
    item = {
        "id": uuid.uuid4().hex[:8],
        "title": args.title.strip(),
        "company": args.company.strip(),
        "url": args.url,
        "notes": (args.notes or "").strip(),
        "status": "saved",
        "created_at": datetime.now(UTC).isoformat(),
    }
    items.insert(0, item)
    save_queue(items)
    print(f"تم حفظ الفرصة. المعرّف: {item['id']}")
    print("الخطوة التالية: راجع الإعلان بنفسك عبر الأمر open، ثم حدّث الحالة بعد الإجراء اليدوي.")


def command_list(_: argparse.Namespace) -> None:
    items = load_queue()
    if not items:
        print("لا توجد فرص محفوظة حتى الآن.")
        return
    print(f"{'المعرّف':<10} {'الحالة':<12} {'الشركة':<24} المسمى")
    print("-" * 78)
    for item in items:
        print(f"{item['id']:<10} {item['status']:<12} {item['company'][:22]:<24} {item['title']}")


def command_open(args: argparse.Namespace) -> None:
    items = load_queue()
    item = find_item(items, args.id)
    webbrowser.open_new_tab(item["url"])
    if item["status"] == "saved":
        item["status"] = "reviewing"
        save_queue(items)
    print("فُتح الإعلان في متصفحك. راجعه وقدّم بنفسك في LinkedIn إذا قررت المتابعة.")


def command_status(args: argparse.Namespace) -> None:
    items = load_queue()
    item = find_item(items, args.id)
    item["status"] = args.value
    item["updated_at"] = datetime.now(UTC).isoformat()
    save_queue(items)
    print(f"تم تحديث «{item['title']}» إلى الحالة: {args.value}")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="منظّم مراجعة التقديم اليدوي في LinkedIn")
    commands = root.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="إضافة إعلان LinkedIn إلى قائمة المراجعة")
    add.add_argument("--title", required=True, help="المسمى الوظيفي")
    add.add_argument("--company", required=True, help="اسم الشركة")
    add.add_argument("--url", required=True, type=linkedin_url, help="رابط الإعلان في LinkedIn")
    add.add_argument("--notes", default="", help="ملاحظات قبل التقديم")
    add.set_defaults(func=command_add)

    listing = commands.add_parser("list", help="عرض قائمة فرص التقديم")
    listing.set_defaults(func=command_list)

    opening = commands.add_parser("open", help="فتح الإعلان للمراجعة والتقديم اليدوي")
    opening.add_argument("--id", required=True, help="معرّف الفرصة")
    opening.set_defaults(func=command_open)

    status = commands.add_parser("status", help="تسجيل نتيجة إجراء يدوي")
    status.add_argument("--id", required=True, help="معرّف الفرصة")
    status.add_argument("--value", choices=STATUSES, required=True, help="الحالة الجديدة")
    status.set_defaults(func=command_status)
    return root


def main() -> None:
    args = parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("تم الإلغاء دون إرسال أي طلب.")
