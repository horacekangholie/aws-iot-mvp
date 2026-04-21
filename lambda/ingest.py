import json
import os
import time
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def _to_decimal(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_decimal(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_decimal(v) for v in value]
    return value


def lambda_handler(event, context):
    payload = event if isinstance(event, dict) else json.loads(event)

    device_id = payload.get("device_id", "unknown-device")
    ts = int(payload.get("ts") or time.time())

    item = {
        "device_id": device_id,
        "ts": ts,
        "temperature": _to_decimal(payload.get("temperature", 0)),
        "humidity": _to_decimal(payload.get("humidity", 0)),
        "battery": _to_decimal(payload.get("battery", 100)),
        "status": payload.get("status", "online"),
        "received_at": int(time.time()),
        "raw": _to_decimal(payload),
    }

    table.put_item(Item=item)

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "ingested", "device_id": device_id, "ts": ts}),
    }
