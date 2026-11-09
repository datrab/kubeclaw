#!/usr/bin/env python3
"""Prompt privately and create Familyclaw's dedicated Telegram Secret.

Run in an ordinary, unrecorded operator terminal with Python 3 and kubectl.
The token is never a CLI argument, written to disk, or printed. This stages
credentials only; channel activation and personal-account pairing follow.
"""

import getpass
import json
import re
import subprocess
import sys
import urllib.request
import warnings


NAMESPACE = "familyclaw"
SECRET = "familyclaw-telegram"
BOT = "N0vbot12000bot"


def kubectl(arguments, payload=None):
    return subprocess.run(
        ["kubectl", "--namespace", NAMESPACE, *arguments],
        input=payload,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )


def telegram(token, method):
    # Never print network exceptions: their URLs contain the credential.
    request = urllib.request.Request(
        "https://api.telegram.org/bot" + token + "/" + method,
        data=b"",
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.load(response)
    if result.get("ok") is not True:
        raise RuntimeError("Telegram-Anfrage fehlgeschlagen.")
    return result["result"]


def main():
    if not sys.stdin.isatty():
        raise RuntimeError("Bitte in einem interaktiven Terminal starten.")
    if kubectl(["get", "deployment", "familyclaw-openclaw", "-o", "name"]).returncode:
        raise RuntimeError("Kein Zugriff auf das Familyclaw-Deployment im aktuellen kubectl-Kontext.")
    existing = kubectl(["get", "secret", SECRET, "--ignore-not-found", "-o", "name"])
    if existing.returncode:
        raise RuntimeError("Secret-Status konnte nicht sicher geprüft werden.")
    if existing.stdout.strip():
        raise RuntimeError("Das Telegram-Secret existiert bereits; es wird nicht überschrieben.")

    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        token = getpass.getpass("BotFather-Token für @" + BOT + " (verdeckt): ").strip()
    if not re.fullmatch(r"[0-9]{5,}:[A-Za-z0-9_-]{20,}", token):
        raise RuntimeError("Ungültiges Token-Format.")
    identity = telegram(token, "getMe")
    if identity.get("is_bot") is not True or identity.get("username", "").casefold() != BOT.casefold():
        raise RuntimeError("Der Token gehört nicht zu @" + BOT + ".")
    if telegram(token, "getWebhookInfo").get("url"):
        raise RuntimeError("Der Bot hat bereits einen Webhook; bestehende Nutzung zuerst prüfen.")

    secret = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {
            "name": SECRET,
            "namespace": NAMESPACE,
            "labels": {"app.kubernetes.io/part-of": "familyclaw"},
            "annotations": {"familyclaw.io/telegram-bot": BOT},
        },
        "type": "Opaque",
        "stringData": {"TELEGRAM_BOT_TOKEN": token},
    }
    result = kubectl(["create", "-f", "-"], json.dumps(secret))
    if result.returncode:
        # Admission responses can echo submitted objects; suppress raw output.
        raise RuntimeError("Secret konnte nicht erstellt werden; Cluster-Status prüfen, bevor du es erneut versuchst.")
    print("Token für @" + BOT + " geprüft und als familyclaw/familyclaw-telegram gespeichert.")
    print("Der Telegram-Kanal ist damit noch nicht aktiviert.")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("Abgebrochen.", file=sys.stderr)
        sys.exit(1)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Einrichtung fehlgeschlagen. Keine vertraulichen Fehlerdetails ausgegeben.", file=sys.stderr)
        sys.exit(1)
