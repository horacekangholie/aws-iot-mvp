# Project — AWS IoT Sensor MVP with Terraform

這是一個對齊你貼出的職務需求所做的可用 MVP。

這個專案覆蓋了以下能力：
- AWS 雲端架構：S3、Lambda、API Gateway、DynamoDB、CloudFront、Cognito、IoT Core
- IoT Device 與雲端整合：模擬裝置透過 MQTT over WebSocket 上傳資料
- API Gateway 與後端服務：受 OAuth2 保護的 HTTP API
- VPC 網路規劃：建立可延展的基礎網路骨架
- OAuth2 驗證：使用 Amazon Cognito Hosted UI
- Web App：模擬使用者登入後讀取裝置最新資料

---

## 1. Business Requirement

某智慧家居感測器公司需要一個最小可行產品，用來證明以下流程可以跑通：

1. IoT 裝置將感測資料上送到雲端。
2. 雲端可以即時接收並儲存資料。
3. 一般使用者透過 Web App 登入後，可以安全地讀取某個裝置的最新數據。
4. 整體架構要能代表未來正式產品的方向，因此必須具備：
   - 雲端原生設計
   - OAuth2 登入
   - API 保護
   - 可擴展的 IoT 接入方式
   - Terraform 基礎建設即程式碼

---

## 2. Architecture Design

### Core Design

本 MVP 採用 **serverless + managed services** 為核心。

- **IoT simulator** 在本機透過 **MQTT over WebSocket** 發送 telemetry 到 **AWS IoT Core**。
- **IoT Topic Rule** 觸發 **Lambda ingest function**。
- Lambda 將資料寫入 **DynamoDB**。
- 前端 Web App 靜態檔部署在 **S3**，由 **CloudFront** 提供 HTTPS 存取。
- 使用者透過 **Amazon Cognito Hosted UI** 做 OAuth2 Login。
- Web App 拿到 JWT 後呼叫 **API Gateway HTTP API**。
- API Gateway 使用 **JWT authorizer** 驗證 Cognito token。
- 驗證成功後，API 呼叫 **Lambda API function**，讀取 DynamoDB 中最新裝置數據。

### Limitations

這是 MVP，不是 production final version。

目前限制：
- 只提供「讀取最新一筆 telemetry」API，沒有完整歷史查詢頁面。
- IoT simulator 使用專門的 demo IAM access key，僅適合測試，不適合正式環境。
- VPC 已建立，但此版 Lambda 未放進 VPC，目的是降低部署複雜度與 NAT 成本。
- 沒有加入多租戶、device registry、device shadow、告警、觀測儀表板。
- 沒有加 CI/CD pipeline。

### AWS Services Used

- **Amazon VPC** — 建立基礎網路邊界
- **Amazon S3** — 存放前端靜態網站檔案
- **Amazon CloudFront** — HTTPS CDN 與前端入口
- **Amazon Cognito** — OAuth2 / OpenID Connect 使用者登入
- **Amazon API Gateway (HTTP API)** — 保護後端 API
- **AWS Lambda** — IoT ingest 與 API backend
- **Amazon DynamoDB** — 儲存裝置 telemetry
- **AWS IoT Core** — 接收 MQTT 訊息
- **IAM** — 權限控管

### Network Design

- 建立一個 `/16` VPC
- 兩個 public subnets 分布於兩個 AZ
- Internet Gateway + public route table
- 一個預留的 security group 供後續 EC2 / ECS / private workloads 使用
- 本版 serverless 元件主要使用 AWS managed network path，不強行放入 VPC，避免 NAT 成本與部署複雜度上升

### Data Flow

1. Simulator 以 IAM access key 透過 MQTT over WebSocket 連到 AWS IoT Core。
2. 資料送到 topic：`devices/telemetry`。
3. IoT Topic Rule 將訊息轉給 ingest Lambda。
4. ingest Lambda 將 telemetry 寫入 DynamoDB。
5. 使用者打開 CloudFront 網址進入 Web App。
6. 使用者透過 Cognito Hosted UI 登入。
7. Cognito 回傳 authorization code，前端交換成 token。
8. 前端帶著 JWT 呼叫 API Gateway `/devices/latest`。
9. API Gateway 用 Cognito JWT authorizer 驗證 token。
10. API Lambda 從 DynamoDB 取最新資料並回傳給前端顯示。

---

## 3. Architecture Diagram

1. IoT Data Ingestion（裝置進來）
![Alt Text](/images/1_IoT_Data_Ingestion.jpg)

+ IoT Device（或 simulator）
+ 使用 MQTT over WebSocket
+ 發送 telemetry → AWS IoT Core

IoT Core = device gateway，負責接設備，不負責業務邏輯

2. Stream Processing（資料進系統）
![Alt Text](/images/2_Stream_Processing.jpg)

+ IoT Rule 被 trigger
+ 呼叫 Lambda（ingestion function）
+ Lambda 處理後寫入 DynamoDB

IoT Rule = event router，Lambda = compute，DynamoDB = storage

3. Backend API Layer（給前端用）
![Alt Text](/images/3_Backend_API_Layer.jpg)

+ 使用 API Gateway
+ 背後接 Lambda（query data）
+ 從 DynamoDB 讀資料

API Gateway = 統一入口 + auth control

4. Authentication
![Alt Text](/images/4_Authentication.jpg)

+ 使用 Cognito
+ Web App login（OAuth2 / JWT）
+ API Gateway 用 JWT Authorizer 驗證

Cognito = OAuth2 provider，API Gateway = resource server

5. Frontend Layer
![Alt Text](/images/5_Frontend_Layer.jpg)

+ CloudFront + S3（Production）


End-to-End Flow

+ Device publish → IoT Core (MQTT)
+ IoT Rule → Lambda ingest
+ Lambda → DynamoDB
+ User login → Cognito (OAuth2)
+ User call API → API Gateway (JWT)
+ API Gateway → Lambda → DynamoDB
+ Return data → Web App

「Device 走 MQTT，User 走 HTTPS，中間用 Lambda + DynamoDB 接起來」


---

## 4. Repository Structure

```text
iot-mvp/
├── README.md
├── terraform/
│   ├── versions.tf
│   ├── variables.tf
│   ├── main.tf
│   ├── outputs.tf
│   └── config.js.tftpl
├── lambda/
│   ├── ingest.py
│   └── api.py
├── web/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── simulator/
    ├── device_simulator.py
    └── requirements.txt
```

---

## 5. Prerequisites

本機需要：
- Terraform >= 1.6
- AWS CLI configured
- Python 3.11+ 或 3.12
- 一個可部署資源的 AWS account

建議先確認：

```bash
aws sts get-caller-identity
terraform version
python --version
```

---

## 6. Deployment Steps

### Step 1 — 進入 Terraform 目錄

```bash
cd terraform
```

### Step 2 — 初始化

```bash
terraform init
```

### Step 3 — 預覽

```bash
terraform plan \
  -var="aws_region=ap-southeast-1" \
  -var="project_name=iot-sensor-mvp" \
  -var="environment=dev"
```

### Step 4 — 部署

```bash
terraform apply \
  -var="aws_region=ap-southeast-1" \
  -var="project_name=iot-sensor-mvp" \
  -var="environment=dev"
```

部署完成後，取得輸出：

```bash
terraform output cloudfront_url
terraform output api_base_url
terraform output cognito_hosted_ui_url
terraform output iot_data_endpoint
terraform output iot_topic
terraform output -raw simulator_access_key_id
terraform output -raw simulator_secret_access_key
```

---

## 7. Create a Test User

這個專案採用 Cognito Hosted UI，自助註冊開啟。

做法：
1. 打開 `terraform output cognito_hosted_ui_url`
2. 點選 **Sign up**
3. 用 email 註冊
4. 輸入驗證碼完成註冊
5. 登入後回到 Web App

---

## 8. Run the IoT Simulator

### Step 1 — 安裝依賴

在專案根目錄：

```bash
cd simulator
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows PowerShell：

```powershell
cd simulator
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Step 2 — 執行模擬器

把 Terraform output 帶進去：

```bash
python device_simulator.py \
  --endpoint "<terraform output iot_data_endpoint>" \
  --region "ap-southeast-1" \
  --access-key "<terraform output -raw simulator_access_key_id>" \
  --secret-key "<terraform output -raw simulator_secret_access_key>" \
  --topic "devices/telemetry" \
  --device-id "demo-device-001" \
  --interval 5
```

成功時會看到類似：

```json
Published: {"device_id": "demo-device-001", "ts": 1713520000, "temperature": 26.91, "humidity": 61.2, "battery": 93, "status": "online"}
```

---

## 9. Use the Web App

1. 打開 `terraform output cloudfront_url`
2. 點 **Login**
3. 完成 Cognito login
4. 回到首頁後按 **Load Latest Telemetry**
5. 即可看到最新裝置數據

若 simulator 正在持續送資料，Web App 每次重新按鈕都能讀到最新一筆。

---

## 10. API Contract

### Request

```http
GET /devices/latest?device_id=demo-device-001
Authorization: Bearer <JWT>
```

### Response

```json
{
  "device_id": "demo-device-001",
  "latest": {
    "device_id": "demo-device-001",
    "ts": 1713520000,
    "temperature": 26.91,
    "humidity": 61.2,
    "battery": 93,
    "status": "online",
    "received_at": 1713520001,
    "raw": {
      "device_id": "demo-device-001",
      "temperature": 26.91,
      "humidity": 61.2,
      "battery": 93,
      "status": "online"
    }
  },
  "count": 1
}
```

---

## 11. Security Design

這個 MVP 至少實作了下面幾件正確的事：

- API 不是 public anonymous access，而是由 Cognito JWT 保護。
- 前端靜態網站不是 public website hosting，而是 S3 + CloudFront + OAC。
- S3 bucket 啟用 SSE-S3 encryption。
- IoT simulator IAM 權限只允許 connect 與 publish 到指定 topic。
- DynamoDB 採按需計費，降低測試成本。

---

## 12. Cost Notes

MVP 雖然走 serverless，但仍然不是零成本。

主要成本來源：
- CloudFront
- Cognito MAU
- Lambda requests
- DynamoDB storage / read / write
- AWS IoT Core messages
- S3 storage

這版沒有 NAT Gateway，因此避免了一個常見的固定成本陷阱。

---

## 13. Production Upgrade Path

如果你要把這個 MVP 升級成更像正式產品，下一步應該是：

1. 將 simulator 改成真實 device certificate / IoT policy 模式
2. 建立 device registry 與 device provisioning 流程
3. 加入 DynamoDB TTL、歷史查詢 API、分頁與時間區間查詢
4. 前端改成 React / Next.js
5. 加入 CloudWatch dashboard、alarms、structured logs、X-Ray
6. 用 WAF、custom domain、ACM certificate、Route 53 強化入口
7. 建立 CI/CD pipeline
8. 若未來有 private backend，再把 Lambda / ECS / RDS 放進 VPC

---

## 14. Destroy

測試結束後，記得清掉：

```bash
cd terraform
terraform destroy
```

---

## 15. What This MVP Proves in an Interview

這個專案可以直接拿來對應職缺要求。

你可以說你做過：
- 用 Terraform 建立 AWS 雲端架構
- 用 AWS IoT Core 做 MQTT device ingestion
- 用 Lambda 建立後端處理流程
- 用 API Gateway 暴露受保護 API
- 用 Cognito 實作 OAuth2 login
- 用 S3 + CloudFront 部署 Web App
- 用 DynamoDB 儲存 IoT telemetry
- 做出從 device 到 frontend 的完整端到端流程

這不是玩具級 hello world。
這是一個完整、可以 demo、可以拿去面試解釋架構取捨的 IoT cloud MVP。
