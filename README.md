# 🌾 AgriBid

### Full-Stack Agricultural Marketplace & Auction Platform

AgriBid is a full-stack web-based agricultural marketplace that connects **farmers and buyers** through a digital crop auction platform. Farmers can create and manage crop auctions, while buyers can discover crops, place bids, maintain wishlists, and track auction activity.

The project evolved from a JSON-based prototype into a **MySQL-backed REST API architecture** with secure authentication, role-based authorization, transaction-safe bidding, dashboards, analytics, and notification workflows.

---

## 🚀 Key Features

### 👨‍🌾 Farmer

* Create and manage crop auctions
* Set quantity, quality, starting price, and minimum bid increment
* Monitor auction activity
* View bidding activity
* Farmer dashboard and analytics
* Farmer verification workflow

### 🛒 Buyer

* Browse available crop auctions
* Search, filter, and sort auctions
* View auction details
* Place bids
* Wishlist management
* Recently viewed auctions
* Buyer dashboard and insights
* Buyer verification workflow

### 👨‍💼 Admin

* Manage platform users
* Review verification requests
* Approve or reject farmer and buyer verification
* Monitor platform activity

---

## 🔐 Authentication & Authorization

AgriBid implements server-side authentication using:

* **bcryptjs** for password hashing
* **JSON Web Tokens (JWT)** for authentication
* Authentication middleware for protected APIs
* Role-based authorization for Farmer, Buyer, and Admin
* Ownership validation for farmer-owned auctions
* Account-status validation
* Secure handling of migrated legacy accounts

Passwords are never stored in plaintext.

---

## ⚡ Transaction-Safe Bidding

One of the key backend features is concurrency-safe bidding.

The bidding process uses a MySQL transaction:

```text
BEGIN TRANSACTION
       ↓
SELECT auction FOR UPDATE
       ↓
Validate current bid
       ↓
Validate minimum increment
       ↓
INSERT bid
       ↓
UPDATE current_bid
       ↓
COMMIT
```

`SELECT ... FOR UPDATE` locks the auction row during the critical operation, preventing concurrent buyers from submitting conflicting bids based on the same outdated current bid.

---

## 🏗️ System Architecture

```text
                 ┌─────────────────────┐
                 │      Browser        │
                 │ HTML/CSS/JavaScript │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Node.js HTTP      │
                 │      Server         │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │     REST APIs       │
                 │ Authentication      │
                 │ Authorization       │
                 │ Auctions / Bids     │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │    mysql2/promise   │
                 │   Connection Pool   │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │      MySQL 8.0      │
                 └─────────────────────┘
```

---

## 🛠️ Technology Stack

### Frontend

* HTML5
* CSS3
* JavaScript
* Bootstrap

### Backend

* Node.js
* Native Node.js HTTP server
* REST APIs
* JSON

### Database

* MySQL 8.0
* mysql2/promise
* Relational database design
* Transactions
* Foreign keys
* Joins
* Connection pooling

### Security

* bcryptjs
* JWT
* Parameterized SQL queries
* Authentication middleware
* Role-based authorization
* Ownership validation

---

## 🗄️ Database Design

The application uses a normalized MySQL database with the following major entities:

```text
users
├── farmers
├── buyers
└── admins

crops
└── auctions
    ├── bids
    └── auction_images

buyers
├── wishlists
└── recently_viewed

users
├── notifications
└── verifications
```

### Main Tables

* `users`
* `farmers`
* `buyers`
* `admins`
* `verifications`
* `crops`
* `auctions`
* `auction_images`
* `bids`
* `wishlists`
* `recently_viewed`
* `notifications`

---

## 🔑 Major REST APIs

### Authentication

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

### Auctions

```text
GET    /api/auctions
POST   /api/auctions
PATCH  /api/auctions/:id
PATCH  /api/auctions/:id/status
DELETE /api/auctions/:id
```

### Bidding

```text
GET  /api/bids
GET  /api/bids?auctionId=:id
POST /api/bids
```

### System

```text
GET /api/health
GET /api/db-health
```

Additional APIs support wishlist, recently viewed auctions, notifications, verification, dashboards, and administrative workflows.

---

## 🔒 Security Practices

AgriBid follows several backend security practices:

* Passwords hashed using bcrypt
* JWT-based authentication
* Parameterized SQL queries
* No plaintext password storage
* Environment variables for sensitive configuration
* Protected API endpoints
* Role-based access control
* Resource ownership validation
* Account-status checks
* Transaction rollback on database errors

---

## 🔄 Database Migration

The original application used JSON files for persistence.

The project was migrated to MySQL:

```text
JSON Files
    ↓
Migration Scripts
    ↓
Normalized MySQL Schema
    ↓
mysql2 Connection Pool
    ↓
REST APIs
```

Existing frontend API contracts were preserved during the migration to minimize changes to the existing UI.

---

## 🧪 Testing

The application includes testing for:

* User registration
* Duplicate accounts
* Password validation
* Login authentication
* Invalid credentials
* JWT validation
* Protected endpoints
* Role-based authorization
* Auction CRUD operations
* Auction ownership
* Bid validation
* Concurrent bidding
* Database transactions
* Verification workflows
* API error cases
* Regression testing

---

## ⚙️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/AgriBid.git
cd AgriBid
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create environment configuration

Copy `.env.example` to `.env`.

Windows:

```powershell
copy .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

Configure your own MySQL credentials and JWT secret.

### 4. Create the database

Create a MySQL database named:

```sql
CREATE DATABASE agribid;
```

Run the project's database/schema scripts to create the required tables.

### 5. Start the server

```bash
npm start
```

The application will be available at:

```text
http://localhost:3000
```

---

## 🔐 Environment Variables

The project uses environment variables for sensitive configuration.

Example:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=agribid

JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=2h
```

**Never commit the `.env` file to GitHub.**

Use `.env.example` as the configuration template.

---

## 📈 Engineering Highlights

Some of the main engineering challenges addressed in AgriBid include:

### JSON → MySQL Migration

Converted a file-based persistence system into a relational database architecture while maintaining existing API contracts.

### Concurrent Bidding

Used database transactions and row-level locking to prevent race conditions during simultaneous bids.

### Authentication

Implemented secure password hashing and JWT-based server-side authentication.

### Authorization

Implemented role and ownership-based access control for Farmer, Buyer, and Admin workflows.

### Maintainability

Separated database access, authentication utilities, middleware, API handling, and frontend functionality into logical components.

---

## 🎯 Learning Outcomes

This project provided hands-on experience with:

* Full-stack web development
* REST API design
* Node.js backend development
* MySQL relational database design
* SQL and joins
* Database transactions
* Concurrency and race conditions
* Authentication and authorization
* JWT
* Password hashing
* API security
* Database migration
* Debugging and testing
* Git/GitHub workflow

---

## 👩‍💻 Author

**Drashti Patel**

Computer Science / Information Technology Student

---

## 📄 License

This project is intended for educational and portfolio purposes.
