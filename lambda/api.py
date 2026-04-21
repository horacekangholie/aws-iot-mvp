import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ["TABLE_NAME"]
DEFAULT_DEVICE_ID = os.environ.get("DEFAULT_DEVICE_ID", "demo-device-001")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def _json_default(value):
    if isinstance(value, Decimal):
        if value % 1 == 0:
            return int(value)
        return float(value)
    raise TypeError(f"Unsupported type: {type(value)}")


def lambda_handler(event, context):
    params = event.get("queryStringParameters") or {}
    device_id = params.get("device_id", DEFAULT_DEVICE_ID)

    response = table.query(
        KeyConditionExpression=Key("device_id").eq(device_id),
        ScanIndexForward=False,
        Limit=1,
    )

    items = response.get("Items", [])
    latest = items[0] if items else None

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(
            {
                "device_id": device_id,
                "latest": latest,
                "count": len(items),
            },
            default=_json_default,
        ),
    }
