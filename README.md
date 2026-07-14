<a id="summary"></a>
<br>

# Madri Noivas - Backend (Node.js + MySQL + Docker) #

A robust, production-ready backend application for the Madri Noivas clothing rental platform. Built with Node.js and MySQL, it features a fully Dockerized environment, JWT authentication, **Swagger documentation**, **Automated Testing**, Role-Based Access Control (RBAC), **Rate Limiting**, and a secure invite-only registration flow.
<br>

## 📋 Summary ##
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Security Features](#security-features)
- [Email & DNS Configuration (Cloudflare)](#email-dns-configuration)
- [Setup for a New Project](#customization)
- [Troubleshooting](#troubleshooting)
<br><a id="key-features"></a><br>

## 🚀 Key Features &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [⬆️](#summary) ##

- **Dockerized Environment:** Zero-config setup with Docker & Docker Compose.
- **MVC Architecture:** Clean separation of concerns (Controllers, Services, Models).
- **🛡️ Advanced Security:**
  - **JWT Authentication:** Secure stateless authentication.
  - **Rate Limiting:** Protection against DDoS (Global) and Brute-Force attacks (Login specific) behind an Nginx reverse proxy.
  - **Password Hashing:** Uses `bcryptjs` for secure storage.
  - **Helmet & CORS:** HTTP header security.
- **🔄 Account Recovery:** Complete "Forgot Password" and "Reset Password" flow with token expiration logic calculated database-side.
- 📚 **Fully Documented**: Interactive API documentation via **Swagger/OpenAPI 3.0**.
- **🧪 Production-Grade Tests**: Comprehensive test suite (Unit, Integration, and Security) using **Jest** and **Supertest** running in band to prevent race conditions.
- **Data Integrity**: Uses **UUIDs** for primary keys and implements **Soft Deletes** (logical exclusion) to preserve data history for rental transactions and products.
- **RBAC (Role-Based Access Control):** Native support for roles: `admin`, `proprietario` (owner), and `atendente` (staff/attendant).
- **Invite-Only Workflow:** Public registration is disabled. Users are created via admin invites and activate their accounts via token sent to their email.
- **Database Seeding:** Automatic database creation and population via `init.sql`.

<br><a id="tech-stack"></a><br>

## 🛠️ Tech Stack &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [⬆️](#summary) ##

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MySQL 8.0
- **ORM/Driver:** mysql2 (using Promises/Connection Pool)
- **Infrastructure:** Hostinger VPS (Ubuntu), Nginx Reverse Proxy, Cloudflare (DNS)
- **Testing**: Jest, Supertest, Cross-Env
- **Documentation**: Swagger UI, YAML
- **Dev Tools:** Nodemon (configured for Docker hot-reloading)

---
<br><a id="getting-started"></a><br>

## 🏁 Getting Started &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [⬆️](#summary) ##

 **Prerequisites**

- [Docker](https://www.docker.com/) and Docker Compose installed on your machine.
- You **do not** need Node.js or MySQL installed locally to run the project.
- Optional: Node.js (v18+) if you wish to run tests locally outside Docker.

### 1. Clone the repository ###

```bash
git clone <repository-url>
cd madrinoivas-backend
```

### 2. Configure Environment Variables ###

Create the `.env` file based on the example provided.

**Linux/Mac:**
```bash
cp .env.example .env
```

**Windows (PowerShell):**
```bash
copy .env.example .env
```

Note: The default values in `.env.example` are already configured to work with the Docker container.

### 3. Run the Application ###

Start the application and the database containers:

```bash
docker compose up --build
```

The server will start at: `http://localhost:3000`

---
<br><a id="api-documentation"></a><br>

## 📚 API Documentation &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [⬆️](#summary) ##

The API is fully documented using Swagger (OpenAPI 3.0). The definitions are maintained in a clean `src/swagger.yaml` file.

Once the server is running, access the interactive documentation at:

👉 **http://localhost:3000/api-docs**

---

### 🧪 Running Tests ###

This boilerplate comes with a complete test suite covering:

1. **Unit Tests**: Controller logic and mocks.
2. **Integration Tests**: Real database operations (CRUD).
3. **Security Tests**: Rate limiting verification and Password Reset flows.

To run the tests locally (requires Node.js installed):

```bash
# Install dependencies
npm install

# Run the test command:
npm test
```
Note: The `npm test` command is configured to run tests sequentially (`--runInBand`) to avoid database race conditions.

---

### 🗄️ Database & Default Users ###

When running for the first time, the `init.sql` script will automatically create the `loja_db` database, the `users` table, and insert the following seed users (password hashes represent `123456`):

| Role | Email | Password (Hash) | 
| :--- | :--- | :--- |
| **Admin** | admin@loja.com | 123456 |
| **Proprietario** (Owner) | dono@loja.com | 123456 | 
| **Atendente** (Staff) | atendente@loja.com | 123456|

---
<br><a id="project-structure"></a><br>

## 📂 Project Structure &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [⬆️](#summary) ##

```plaintext
src/
├── config/         # Database connection pool
├── controllers/    # Request handlers (Auth, User)
├── middlewares/    # Auth (JWT), Rate Limit, and RBAC logic
├── models/         # Database queries (SQL)
├── routes/         # API Route definitions
├── utils/          # Helper scripts
├── app.js          # Express app setup
├── server.js       # Entry point
└── swagger.yaml    # OpenAPI Documentation
tests/
├── auth.test.js           # Login & Token logic
├── integration.test.js    # End-to-end DB tests
├── password_reset.test.js # Forgot/Reset password flow
├── ratelimit.test.js      # Brute-force protection tests
└── user.test.js           # Unit tests (Mocked)
```
<br><a id="security-features"></a><br>

## 🔒 Security Features &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [⬆️](#summary) ##

**1. Rate Limiting (Behind Nginx)**
- The application uses `express-rate-limit`. Because it operates behind an Nginx reverse proxy, the Express server is explicitly configured to read the `X-Forwarded-For` header by enabling `app.set('trust proxy', 1)`.
- **Global API**: Limits IPs to 100 requests per 15 minutes.
- **Login Endpoint**: Strict limit of 5 failed attempts per 15 minutes to prevent brute-force attacks.

**2. Authentication Flow**
Protected routes require a **Bearer Token** in the Authorization header.
1. `POST /api/auth/login` to receive a token.
2. Send header: `Authorization: Bearer <YOUR_TOKEN>`

**3. Password Recovery & User Registration (Invite Flow)**
- Public "Sign Up" is disabled. 
- Admin sends an invite via `/api/auth/invite`.
- The system generates a secure token and emails it to the user.
- The user completes registration or resets their password via token validation.

---
<br><a id="email-dns-configuration"></a><br>

## 📧 Email & DNS Configuration (Cloudflare) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [⬆️](#summary) ##

The application utilizes NodeMailer to dispatch transactional emails (invites, temporary passwords) via Hostinger SMTP. Because the domain's DNS is managed by **Cloudflare**, strict DNS configurations are required to ensure 10/10 deliverability and prevent emails from landing in spam.

### ⚠️ The "Gray Cloud" Rule (Proxy Status)
Any DNS record related to email authentication (`TXT`, `CNAME`, `MX`) or secondary protocols (like `ftp`) **MUST** have the Cloudflare Proxy status disabled (**DNS Only**). If proxied (Orange Cloud), receiving mail servers cannot read the cryptographic signatures and will fail the message.

### Required DNS Records
The following records must be present and configured as **DNS Only** in the Cloudflare dashboard:

**1. SPF (Sender Policy Framework)**
*   **Type:** `TXT`
*   **Name:** `@` (or `madrinoivas.com.br`)
*   **Content:** `v=spf1 include:_spf.mail.hostinger.com ~all`

**2. DKIM (DomainKeys Identified Mail)**
*   **Type:** `CNAME`
*   **Name:** E.g., `hostingermail-a._domainkey` (Generated in the Hostinger Email Panel)
*   **Content:** The corresponding cryptographic key provided by Hostinger.
*   *Note: Ensure all 3 DKIM keys generated by Hostinger are added as DNS Only.*

**3. DMARC**
*   **Type:** `TXT`
*   **Name:** `_dmarc`
*   **Content:** `v=DMARC1; p=none; rua=mailto:nao-responda@madrinoivas.com.br`

---
<br><a id="customization"></a><br>

## ⚙️ Customization (Setup for a New Project) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [⬆️](#summary) ##

If you are cloning this boilerplate to start a brand new project, follow these steps to detach it from the template and configure the database correctly:

**1. Update Project Metadata**
Open `package.json` and update the `name`, `version`, and `description` fields to match your new project.

**2. Security Configuration (.env)**
In your `.env` file (created from `.env.example`), **you must change**:
* `JWT_SECRET`: Generate a new long random string (e.g., using `openssl rand -base64 32`).
* `DB_PASSWORD`: Set a strong password for the database root user.
* `DB_NAME`: Change this to a unique name for your project (e.g., `madrinoivas_db`).

**3. Database Renaming (Crucial Step)**
If you changed `DB_NAME` in the `.env` file, you **must** manually update it in two other files to ensure the connection works:

**A. In** `docker-compose.yml`:
```yaml
    environment:
      MYSQL_DATABASE: madrinoivas_db  # <--- Change this
```

**B. In** `init.sql`:
```sql
CREATE DATABASE IF NOT EXISTS madrinoivas_db; -- <--- Change this
USE madrinoivas_db;                           -- <--- Change this
```

**4. Re-initialize Git**
To detach this project from the boilerplate repository and start a fresh history:
```bash
# 1. Remove the existing git history
rm -rf .git  # (Linux/Mac) or 'rd .git /s /q' (Windows)

# 2. Start a new repository
git init
git add .
git commit -m "initial commit"
```
---
<br><a id="troubleshooting"></a><br>

## 🛠 Troubleshooting   &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [⬆️](#summary) ##

**MySQL Port Conflict (3306)**
If you already have a MySQL instance running locally on port **3306**, the Docker container will fail to start.
* **Symptom**:  The `docker compose up` command displays the error: `Bind for 0.0.0.0:3306 failed: port is already allocated`.
* **Solution**: Modify the ports section in `docker-compose.yml` to map to `3307:3306`, and update `DB_PORT=3307` in your `.env` file. The test script is configured to adapt to this change automatically.

**Connection Error During Tests (ECONNREFUSED)**
Check if the database container is active using `docker ps`. Make sure the `src/config/database.js` file is properly reading the `process.env.DB_PORT` variable.

---
<br>

### 🤝 Contributing ###

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Commit your changes (`git commit -m 'feat: add amazing feature'`)
3. Push to the branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request

---
**License:** This project is open-source and available under the MIT License.