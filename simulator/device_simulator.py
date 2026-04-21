import argparse
import json
import random
import threading
import time
from datetime import datetime, timezone

from awscrt import auth, http, io, mqtt
from awsiot import mqtt_connection_builder


def build_payload(device_id: str) -> dict:
    return {
        "device_id": device_id,
        "ts": int(time.time()),
        "temperature": round(random.uniform(21.0, 31.5), 2),
        "humidity": round(random.uniform(40.0, 80.0), 2),
        "battery": random.randint(60, 100),
        "status": random.choice(["online", "online", "online", "warning"]),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    parser = argparse.ArgumentParser(description="Publish simulated telemetry to AWS IoT Core over MQTT over WebSocket.")
    parser.add_argument("--endpoint", required=True, help="AWS IoT Core data endpoint, for example a123456789-ats.iot.ap-southeast-1.amazonaws.com")
    parser.add_argument("--region", required=True, help="AWS region")
    parser.add_argument("--access-key", required=True, help="Simulator IAM access key id")
    parser.add_argument("--secret-key", required=True, help="Simulator IAM secret access key")
    parser.add_argument("--topic", required=True, help="MQTT topic")
    parser.add_argument("--device-id", default="demo-device-001", help="Device id")
    parser.add_argument("--interval", type=int, default=5, help="Publish interval in seconds")
    args = parser.parse_args()

    event_loop_group = io.EventLoopGroup(1)
    host_resolver = io.DefaultHostResolver(event_loop_group)
    client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)
    credentials_provider = auth.AwsCredentialsProvider.new_static(
        access_key_id=args.access_key,
        secret_access_key=args.secret_key,
        session_token=None,
    )

    mqtt_connection = mqtt_connection_builder.websockets_with_default_aws_signing(
        endpoint=args.endpoint,
        client_bootstrap=client_bootstrap,
        region=args.region,
        credentials_provider=credentials_provider,
        http_proxy_options=None,
        ca_filepath=None,
        on_connection_interrupted=lambda connection, error, **kwargs: print(f"Connection interrupted: {error}"),
        on_connection_resumed=lambda connection, return_code, session_present, **kwargs: print("Connection resumed"),
        client_id=f"{args.device_id}-{int(time.time())}",
        clean_session=True,
        keep_alive_secs=30,
    )

    print(f"Connecting to {args.endpoint}...")
    connect_future = mqtt_connection.connect()
    connect_future.result()
    print("Connected.")

    stop_event = threading.Event()

    try:
        while not stop_event.is_set():
            payload = build_payload(args.device_id)
            mqtt_connection.publish(
                topic=args.topic,
                payload=json.dumps(payload),
                qos=mqtt.QoS.AT_LEAST_ONCE,
            )
            print(f"Published: {json.dumps(payload)}")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("Stopping publisher...")
    finally:
        disconnect_future = mqtt_connection.disconnect()
        disconnect_future.result()
        print("Disconnected.")


if __name__ == "__main__":
    main()
