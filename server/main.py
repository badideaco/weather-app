"""
StormScope Weather Push — Lambda

Two invocation modes (same pattern as infra-health-check):
1. EventBridge schedule (rate 5 min) -> poll NWS active alerts for each
   subscriber's location and web-push any alert not already sent.
2. Function URL HTTP -> push subscription management endpoints.

Endpoints:
  GET  /push/vapid-key     -> {"publicKey": ...}            (no auth)
  POST /push/subscribe     -> body {subscription, lat, lon}  (Bearer AUTH_TOKEN)
  POST /push/unsubscribe   -> body {endpoint}                (Bearer AUTH_TOKEN)
  POST /push/test          -> test notification to all subs  (Bearer AUTH_TOKEN)

DynamoDB single-table (stateKey S):
  sub#<sha16(endpoint)>            subscription + lat/lon, TTL 90d (refreshed on re-register)
  sent#<sha16(endpoint)>#<sha16(alertId)>   dedup marker, TTL 7d
"""
import base64
import hashlib
import json
import logging
import os
import time
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get("AWS_REGION", "us-east-2")
DYNAMO_TABLE = os.environ.get("DYNAMO_TABLE", "weather-push-state")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_EMAIL = os.environ.get("VAPID_EMAIL", "mike@badideaco.com")
AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")

TTL_SUB = 90 * 24 * 3600
TTL_SENT = 7 * 24 * 3600

NWS_HEADERS = {
    "User-Agent": "(StormScope Weather Push, mike@badideaco.com)",
    "Accept": "application/geo+json",
}

SEVERITY_EMOJI = {"Extreme": "\U0001F6A8", "Severe": "⚠️", "Moderate": "⚠️", "Minor": "ℹ️"}


def _hash(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


# ── DynamoDB state ──

def save_subscription(table, subscription, lat, lon):
    sub_hash = _hash(subscription["endpoint"])
    table.put_item(Item={
        "stateKey": f"sub#{sub_hash}",
        "subscription": subscription,
        "lat": Decimal(str(round(float(lat), 2))),
        "lon": Decimal(str(round(float(lon), 2))),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "ttl": int(time.time() + TTL_SUB),
    })
    return sub_hash


def load_subscriptions(table):
    subs = []
    resp = table.scan(
        FilterExpression="begins_with(stateKey, :p)",
        ExpressionAttributeValues={":p": "sub#"},
    )
    subs.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = table.scan(
            FilterExpression="begins_with(stateKey, :p)",
            ExpressionAttributeValues={":p": "sub#"},
            ExclusiveStartKey=resp["LastEvaluatedKey"],
        )
        subs.extend(resp.get("Items", []))
    return subs


def delete_subscription(table, endpoint):
    try:
        table.delete_item(Key={"stateKey": f"sub#{_hash(endpoint)}"})
        logger.info("Deleted stale subscription")
    except Exception as e:
        logger.error(f"Failed to delete subscription: {e}")


def was_sent(table, sub_hash, alert_hash):
    resp = table.get_item(Key={"stateKey": f"sent#{sub_hash}#{alert_hash}"})
    return "Item" in resp


def mark_sent(table, sub_hash, alert_hash):
    table.put_item(Item={
        "stateKey": f"sent#{sub_hash}#{alert_hash}",
        "ttl": int(time.time() + TTL_SENT),
    })


# ── Web push ──

def send_push(subscription, title, body, tag):
    """Send one web push. Returns True, False, or 'stale'."""
    from pywebpush import webpush, WebPushException

    payload = json.dumps({"title": title, "body": body, "tag": tag, "url": "/"})
    try:
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{VAPID_EMAIL}"},
        )
        return True
    except WebPushException as e:
        if getattr(e, "response", None) is not None and e.response.status_code in (404, 410):
            return "stale"
        logger.error(f"Push failed: {e}")
        return False
    except Exception as e:
        logger.error(f"Push error: {e}")
        return False


# ── NWS alert polling ──

def fetch_active_alerts(lat, lon):
    url = f"https://api.weather.gov/alerts/active?point={lat},{lon}"
    req = urllib.request.Request(url, headers=NWS_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data.get("features", [])


def alert_notification_fields(feature):
    props = feature.get("properties", {})
    severity = props.get("severity", "")
    event = props.get("event", "Weather Alert")
    emoji = SEVERITY_EMOJI.get(severity, "⚠️")
    title = f"{emoji} {event}"
    body = props.get("headline") or props.get("description", "")[:140] or event
    return title, body


def run_alert_cycle():
    ddb = boto3.resource("dynamodb", region_name=REGION)
    table = ddb.Table(DYNAMO_TABLE)
    subs = load_subscriptions(table)
    if not subs:
        return {"statusCode": 200, "body": json.dumps({"ok": True, "subscribers": 0})}

    # One NWS request per unique (rounded) location
    by_location = {}
    for item in subs:
        key = (str(item.get("lat")), str(item.get("lon")))
        by_location.setdefault(key, []).append(item)

    sent = skipped = stale = failed = 0
    for (lat, lon), loc_subs in by_location.items():
        try:
            alerts = fetch_active_alerts(lat, lon)
        except Exception as e:
            logger.error(f"NWS fetch failed for {lat},{lon}: {e}")
            continue

        for feature in alerts:
            alert_hash = _hash(feature.get("id", ""))
            title, body = alert_notification_fields(feature)
            for item in loc_subs:
                sub = item["subscription"]
                sub_hash = _hash(sub["endpoint"])
                if was_sent(table, sub_hash, alert_hash):
                    skipped += 1
                    continue
                result = send_push(sub, title, body, alert_hash)
                if result is True:
                    mark_sent(table, sub_hash, alert_hash)
                    sent += 1
                elif result == "stale":
                    delete_subscription(table, sub["endpoint"])
                    stale += 1
                else:
                    failed += 1

    summary = {"ok": True, "subscribers": len(subs), "locations": len(by_location),
               "sent": sent, "skipped": skipped, "stale": stale, "failed": failed}
    logger.info(f"Alert cycle: {json.dumps(summary)}")
    return {"statusCode": 200, "body": json.dumps(summary)}


# ── HTTP routing (Function URL) ──

def _json_response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def _check_auth(event):
    if not AUTH_TOKEN:
        return False
    auth = event.get("headers", {}).get("authorization", "")
    return auth == f"Bearer {AUTH_TOKEN}"


def _parse_body(event):
    body = event.get("body", "")
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    return json.loads(body)


def route_http(event):
    raw_path = event.get("rawPath", "/")
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

    if raw_path == "/push/vapid-key" and method == "GET":
        return _json_response(200, {"publicKey": VAPID_PUBLIC_KEY})

    if raw_path == "/push/subscribe" and method == "POST":
        if not _check_auth(event):
            return _json_response(401, {"error": "Unauthorized"})
        try:
            data = _parse_body(event)
            subscription = data["subscription"]
            lat, lon = data["lat"], data["lon"]
        except (json.JSONDecodeError, KeyError, TypeError):
            return _json_response(400, {"error": "Expected {subscription, lat, lon}"})
        if not subscription.get("endpoint"):
            return _json_response(400, {"error": "Missing subscription endpoint"})

        ddb = boto3.resource("dynamodb", region_name=REGION)
        table = ddb.Table(DYNAMO_TABLE)
        sub_key = f"sub#{_hash(subscription['endpoint'])}"
        is_new = "Item" not in table.get_item(Key={"stateKey": sub_key})
        sub_hash = save_subscription(table, subscription, lat, lon)

        # Welcome push so the device confirms end-to-end (new subscriptions only)
        if is_new:
            send_push(subscription, "⛈️ StormScope Alerts Enabled",
                      "You'll be notified of weather alerts for your area.", "welcome")
        return _json_response(200, {"ok": True, "id": sub_hash})

    if raw_path == "/push/unsubscribe" and method == "POST":
        if not _check_auth(event):
            return _json_response(401, {"error": "Unauthorized"})
        try:
            data = _parse_body(event)
            endpoint = data["endpoint"]
        except (json.JSONDecodeError, KeyError, TypeError):
            return _json_response(400, {"error": "Expected {endpoint}"})
        ddb = boto3.resource("dynamodb", region_name=REGION)
        delete_subscription(ddb.Table(DYNAMO_TABLE), endpoint)
        return _json_response(200, {"ok": True})

    if raw_path == "/push/test" and method == "POST":
        if not _check_auth(event):
            return _json_response(401, {"error": "Unauthorized"})
        ddb = boto3.resource("dynamodb", region_name=REGION)
        table = ddb.Table(DYNAMO_TABLE)
        subs = load_subscriptions(table)
        sent = 0
        for item in subs:
            if send_push(item["subscription"], "StormScope Test",
                         "Push notifications are working!", "test") is True:
                sent += 1
        return _json_response(200, {"ok": True, "sent": sent, "subscribers": len(subs)})

    return _json_response(404, {"error": f"Not found: {method} {raw_path}"})


def handler(event, context):
    try:
        if event.get("source") == "aws.events" or event.get("detail-type"):
            return run_alert_cycle()
        return route_http(event)
    except Exception as e:
        logger.error(f"Handler error: {e}", exc_info=True)
        raise
