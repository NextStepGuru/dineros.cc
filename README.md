# Dineros.cc - Predictive Budgeting & Financial Management

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/deyoungjd/dineros.cc)
[![PR Checks](https://img.shields.io/badge/ci-pr%20checks-blue)](https://github.com/deyoungjd/dineros.cc/actions)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.14.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Custom%20NC-orange)](./LICENSE)

> **The solution to predictive budgeting, real-time spending optimization, & accounting made simple**

Dineros.cc is a comprehensive financial management platform that provides predictive budgeting, real-time spending optimization, and simplified accounting. Built with Nuxt 4, TypeScript, and a modern microservice architecture.

## License and usage

Dineros is source-available under a custom non-commercial license in `LICENSE`.

- Copyright remains with Jeremy DeYoung.
- Personal and non-commercial use is allowed.
- Commercial use requires a separate written license from Jeremy DeYoung.
- Attribution is required.

Read the full terms in `LICENSE`.

## Tech stack

- Nuxt 4 + Vue 3
- TypeScript
- Prisma ORM
- MySQL 8
- Redis
- PNPM workspaces

## Requirements

- Node `24.14.0+` (see `.nvmrc`)
- PNPM `10+`
- MySQL 8
- Redis

## Local development

1. Clone and install:

```bash
git clone https://github.com/deyoungjd/dineros.cc.git
cd dineros.cc
pnpm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Start dependencies:

```bash
docker compose up -d
```

4. Run database migrations:

```bash
pnpm --filter dineros-app exec prisma migrate deploy
```

5. Start the app:

```bash
pnpm dev
```

App URL: `http://localhost:3000`

## Common commands

From repo root:

```bash
pnpm dev
pnpm lint
pnpm test
pnpm test:e2e
```

App package targeted commands:

```bash
pnpm --filter dineros-app exec prisma generate
pnpm --filter dineros-app exec prisma migrate deploy
```

## Project layout

- `app/`: Nuxt application, API routes, Prisma schema, tests.
- `microservice/`: companion service code.
- `scripts/`: local automation and maintenance scripts.
- `docs/`: project-specific documentation.
- `.github/workflows/`: CI, checks, and deployment workflows.

## Contributing

Community contributions are welcome.

- Start with `CONTRIBUTING.md`
- Follow `CODE_OF_CONDUCT.md`
- Report vulnerabilities via `SECURITY.md`

Fork PRs run contributor-safe checks. Deploy workflows are maintainer-only.

## Maintainers

- Jeremy DeYoung (project owner and lead maintainer)

## Public launch checklist

Before/when making the repository fully public:

- Ensure repository visibility is set to public.
- Enable GitHub Issues.
- Optionally enable GitHub Discussions.
- Keep `SECURITY.md` reporting details current.


## 🚀 Features

### 💰 **Core Financial Management**

- **Predictive Budgeting**: Advanced forecasting engine with 5-10x performance improvements
- **Real-time Spending Tracking**: Monitor expenses and income in real-time
- **Multi-Account Support**: Manage checking, savings, credit cards, loans, and investment accounts
- **Automated Recurring Transactions**: Handle bills, payroll, and regular expenses
- **Loan & Credit Card Management**: Interest calculations, minimum payments, and debt tracking
- **Investment Account Support**: 401k, HSA, ESA, and other investment vehicles
- **Asset Tracking**: Houses, cars, and other valuable assets

### 🔧 **Technical Features**

- **Modern Architecture**: Nuxt 4 with TypeScript and modular service design
- **High-Performance Forecasting**: Custom ModernCacheService for lightning-fast calculations
- **Microservice Support**: Separate microservice for specialized operations
- **Database Encryption**: Field-level encryption for sensitive financial data
- **Queue Management**: BullMQ for background job processing
- **Real-time Updates**: WebSocket support for live data synchronization
- **Plaid Integration**: Secure bank account linking and transaction sync
- **Two-Factor Authentication**: Enhanced security with TOTP support

### 📊 **Advanced Analytics**

- **Financial Forecasting**: 5-year projections with scenario modeling
- **Balance Tracking**: Real-time account balance monitoring
- **Transfer Management**: Inter-account transfers with validation
- **Performance Metrics**: Detailed financial performance analytics
- **Custom Reports**: Generate personalized financial reports

## 🏗️ Architecture

### **Main Application**

```
Frontend (Nuxt 4)
├── Pages & Components
├── State Management (Pinia)
├── UI Components (@nuxt/ui)
└── API Integration

Backend Services
├── Forecast Engine (Modular Architecture)
├── Account Management
├── Transaction Processing
├── Plaid Integration
├── Authentication & Security
└── Queue Management (BullMQ)
```

### **Microservice Architecture**

```
Main Application (Port 3000)
├── Web Interface
├── API Endpoints
└── Core Business Logic

Microservice (Port 3001)
├── Specialized Operations
├── Background Processing
└── Extended Functionality
```

### **Forecast Engine (New Architecture)**

```
ForecastEngine (Orchestrator)
├── DataLoaderService (Database → Cache)
├── AccountRegisterService (Account Operations)
├── ReoccurrenceService (Recurring Transactions)
├── RegisterEntryService (Entry Management)
├── LoanCalculatorService (Interest Calculations)
├── TransferService (Account Transfers)
└── DataPersisterService (Cache → Database)
```

## 🛠️ Technology Stack

### **Frontend**

- **Nuxt 4**: Vue.js framework with SSR/SSG
- **TypeScript**: Full type safety
- **@nuxt/ui**: Modern UI components
- **Pinia**: State management
- **Tailwind CSS**: Utility-first styling

### **Backend**

- **Node.js 24.14+**: Runtime environment
- **Prisma**: Database ORM with migrations
- **PostgreSQL/MySQL**: Primary database
- **Redis**: Caching and session storage
- **BullMQ**: Job queue management

### **Infrastructure**

- **Docker**: Containerization
- **Docker Compose**: Local development
- **Plaid API**: Bank account integration
- **Postmark**: Email delivery
- **NATS**: Message queuing

## 📦 Installation & Setup

### **Prerequisites**

- Node.js 24.14.0 or higher
- Docker and Docker Compose
- Git

### **Quick Start**

1. **Clone the repository**

```bash
git clone https://github.com/deyoungjd/dineros.cc.git
cd dineros.cc
```

2. **Install dependencies**

```bash
# Using pnpm (recommended)
pnpm install

# Or using npm
npm install
```

3. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start development environment**

```bash
# Start database and Redis
docker-compose up -d

# Run database migrations
pnpm prisma migrate deploy

# Start development server
pnpm dev
```

5. **Access the application**

- Main app: http://localhost:3000
- Microservice: http://localhost:3001

### **Docker Setup**

For production-like environment:

```bash
# Build and test Docker images
./build-test.sh

# Run with Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

## 🔧 Development

### **Available Scripts**

```bash
# Development
pnpm dev                    # Start development server
pnpm build                  # Build for production
pnpm preview                # Preview production build

# Testing
pnpm test                   # Run all tests
pnpm test:forecast          # Run forecast engine tests
pnpm test:forecast:all      # Run all forecast tests
pnpm test:forecast:unit     # Run unit tests only
pnpm test:forecast:integration # Run integration tests

# Database
pnpm prisma migrate dev      # Create and apply migrations
pnpm prisma generate        # Generate Prisma client
pnpm reset-database         # Reset database (development)

# Code Quality
pnpm lint                   # Run ESLint
pnpm lint-fix               # Fix linting issues
pnpm pre-commit             # Run pre-commit checks
```

### **Forecast Engine Testing**

The forecast engine has comprehensive testing:

```bash
# Quick functionality test
npm run test:forecast

# Performance testing
npm run test:forecast:performance

# All test suites
npm run test:forecast:all
```

### **Database Management**

```bash
# Apply migrations
pnpm prisma migrate deploy

# Reset database (development only)
pnpm reset-database

# Generate Prisma client
pnpm prisma generate
```

## 🚀 Deployment

### **Production Build**

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

### **Docker Deployment**

```bash
# Build Docker images
docker build -t dineros-main .
cd microservice && docker build -t dineros-microservice .

# Run containers
docker run -p 3000:3000 dineros-main
docker run -p 3001:3000 dineros-microservice
```

### **Environment Variables**

Required environment variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/dineros"

# Redis
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="your-jwt-secret"
RSA_PRIVATE_KEY="your-rsa-private-key"
RSA_PUBLIC_KEY="your-rsa-public-key"

# Plaid Integration
PLAID_CLIENT_ID="your-plaid-client-id"
PLAID_SECRET="your-plaid-secret"

# Email
POSTMARK_API_KEY="your-postmark-api-key"
```

## 📊 Performance

### **Forecast Engine Performance**

| Dataset Size                     | Execution Time | Memory Usage | Improvement |
| -------------------------------- | -------------- | ------------ | ----------- |
| Small (1 account, 10 entries)    | < 50ms         | < 5MB        | 5x faster   |
| Medium (10 accounts, 1K entries) | < 500ms        | < 25MB       | 3x faster   |
| Large (50 accounts, 10K entries) | < 2s           | < 100MB      | 2x faster   |

### **Cache Performance**

- **ModernCacheService**: 60% less memory usage than LokiJS
- **Query Performance**: 10x faster for complex operations
- **Memory Efficiency**: Optimized for financial data patterns

## 🔒 Security

### **Data Protection**

- **Field-level Encryption**: Sensitive data encrypted at rest
- **JWT Authentication**: Secure token-based authentication
- **Two-Factor Authentication**: TOTP support for enhanced security
- **HTTPS Enforcement**: Secure communication protocols

### **Compliance**

- **GDPR Ready**: Data protection and privacy controls
- **Financial Data Standards**: Secure handling of financial information
- **Audit Logging**: Comprehensive activity tracking

## 🤝 Contributing

### **Development Workflow**

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Run tests**
   ```bash
   pnpm test:forecast:all
   ```
5. **Submit a pull request**

### **Code Style**

- **TypeScript**: Incremental strictness (project currently runs with relaxed type checks)
- **ESLint**: Code quality enforcement
- **Pre-commit hooks**: Automated quality checks
- **Conventional Commits**: Standardized commit messages

### **Testing Guidelines**

- **Unit Tests**: Test individual components and services
- **Integration Tests**: Test service interactions
- **Performance Tests**: Monitor forecast engine performance
- **End-to-End Tests**: Test complete user workflows

## 📚 Documentation

### **API Documentation**

- **REST API**: `/api/` endpoints for all operations
- **WebSocket API**: Real-time data synchronization
- **Plaid Webhooks**: Bank account integration

### **Architecture Documentation**

- **Forecast Engine**: [Forecast Engine README](server/services/forecast/README.md)
- **Migration Guide**: [Migration Guide](server/services/forecast/migration-guide.md)
- **Testing Guide**: [Testing Documentation](server/services/forecast/TESTING.md)

### **Development Guides**

- **Quick Test Commands**: [Quick Test Guide](server/services/forecast/QUICK_TEST.md)
- **Cache Analysis**: [Cache System Analysis](server/services/forecast/cache-analysis.md)

## 🐛 Troubleshooting

### **Common Issues**

**Database Connection Issues**

```bash
# Check database status
docker-compose ps

# Reset database
pnpm reset-database
```

**Forecast Engine Performance**

```bash
# Run performance tests
npm run test:forecast:performance

# Check cache statistics
npm run test:forecast
```

**Docker Build Issues**

```bash
# Test Docker builds
./build-test.sh

# Clean Docker cache
docker system prune -a
```

### **Debug Mode**

```bash
# Enable debug logging
DEBUG=forecast:* pnpm dev

# Check logs
docker logs dineros-main
docker logs dineros-microservice
```

## 📄 License

See the [LICENSE](LICENSE) file for full terms (custom non-commercial license).

## 🆘 Support

### **Getting Help**

- **Issues**: Create an issue on GitHub
- **Documentation**: Check the `/docs` directory
- **Community**: Join our Discord/Telegram

### **Contact**

- **Email**: support@dineros.cc
- **Website**: https://dineros.cc
- **Documentation**: https://docs.dineros.cc

## 🎉 Acknowledgments

- **Nuxt Team**: For the amazing Nuxt 4 framework
- **Prisma Team**: For the excellent database toolkit
- **Plaid**: For secure financial data integration
- **Community Contributors**: For all the valuable contributions

---

**Built with ❤️ by the Dineros.cc team**
