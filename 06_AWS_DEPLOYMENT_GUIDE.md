# AWS Production Deployment Guide

## Architecture Overview

Your system has 4 microservices + 3 data stores:

```
Services:
- API (Express.js)
- Worker (Background jobs + Cron)
- Mail Queue (Email processing)
- Payment Service (Payment processing)

Data Stores:
- PostgreSQL (Primary database)
- Redis (Cache + Queues)
- Elasticsearch (Search engine)
```

---

## Deployment Options on AWS

### Option 1: ECS (Elastic Container Service) - Recommended for Containerized Apps ✅

**Best for:** Your Docker-based microservices architecture

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│                     AWS Cloud                            │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │              VPC (Virtual Network)              │    │
│  │                                                 │    │
│  │  ┌──────────────────────────────────────────┐  │    │
│  │  │  Application Load Balancer (ALB)         │  │    │
│  │  │  - HTTPS (SSL/TLS)                       │  │    │
│  │  │  - Auto-scaling                          │  │    │
│  │  └────────────┬─────────────────────────────┘  │    │
│  │               │                                 │    │
│  │  ┌────────────▼──────────────────────────┐    │    │
│  │  │     ECS Cluster (Fargate)             │    │    │
│  │  │                                        │    │    │
│  │  │  ┌──────────┐  ┌──────────┐          │    │    │
│  │  │  │   API    │  │  Worker  │          │    │    │
│  │  │  │ Service  │  │ Service  │          │    │    │
│  │  │  │ (3 tasks)│  │ (2 tasks)│          │    │    │
│  │  │  └──────────┘  └──────────┘          │    │    │
│  │  │                                        │    │    │
│  │  │  ┌──────────┐  ┌──────────┐          │    │    │
│  │  │  │   Mail   │  │ Payment  │          │    │    │
│  │  │  │  Queue   │  │ Service  │          │    │    │
│  │  │  │ (2 tasks)│  │ (2 tasks)│          │    │    │
│  │  │  └──────────┘  └──────────┘          │    │    │
│  │  └────────────────────────────────────────┘  │    │
│  │                                                 │    │
│  │  Data Layer (Managed Services)                 │    │
│  │  ┌──────────────────────────────────────────┐  │    │
│  │  │  RDS PostgreSQL (Multi-AZ)               │  │    │
│  │  │  - Automatic backups                     │  │    │
│  │  │  - Read replicas                         │  │    │
│  │  └──────────────────────────────────────────┘  │    │
│  │                                                 │    │
│  │  ┌──────────────────────────────────────────┐  │    │
│  │  │  ElastiCache Redis (Cluster Mode)        │  │    │
│  │  │  - Automatic failover                    │  │    │
│  │  │  - Multi-AZ                              │  │    │
│  │  └──────────────────────────────────────────┘  │    │
│  │                                                 │    │
│  │  ┌──────────────────────────────────────────┐  │    │
│  │  │  Amazon Elasticsearch Service            │  │    │
│  │  │  (OpenSearch)                            │  │    │
│  │  │  - 3 data nodes (Multi-AZ)               │  │    │
│  │  └──────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Additional Services:                                    │
│  - ECR (Container Registry)                             │
│  - CloudWatch (Logging & Monitoring)                    │
│  - Secrets Manager (Credentials)                        │
│  - Route 53 (DNS)                                       │
│  - ACM (SSL Certificates)                               │
└─────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Deployment: ECS Fargate

### Prerequisites

1. **AWS Account** with billing enabled
2. **AWS CLI** installed and configured
3. **Docker** installed locally
4. **Domain name** (optional, for custom domain)

---

### Step 1: Create ECR Repositories (Container Registry)

Store your Docker images in AWS ECR:

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Create repositories for each service
aws ecr create-repository --repository-name event-api --region us-east-1
aws ecr create-repository --repository-name event-worker --region us-east-1
aws ecr create-repository --repository-name event-mail-queue --region us-east-1
aws ecr create-repository --repository-name event-payment-service --region us-east-1
```

---

### Step 2: Build and Push Docker Images

```bash
# Set your AWS account ID and region
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export ECR_REGISTRY=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push API
cd api
docker build -t event-api .
docker tag event-api:latest $ECR_REGISTRY/event-api:latest
docker push $ECR_REGISTRY/event-api:latest

# Build and push Worker
cd ../worker
docker build -t event-worker .
docker tag event-worker:latest $ECR_REGISTRY/event-worker:latest
docker push $ECR_REGISTRY/event-worker:latest

# Build and push Mail Queue
cd ../mail-queue
docker build -t event-mail-queue .
docker tag event-mail-queue:latest $ECR_REGISTRY/event-mail-queue:latest
docker push $ECR_REGISTRY/event-mail-queue:latest

# Build and push Payment Service
cd ../payment-service
docker build -t event-payment-service .
docker tag event-payment-service:latest $ECR_REGISTRY/event-payment-service:latest
docker push $ECR_REGISTRY/event-payment-service:latest
```

---

### Step 3: Set Up Managed Data Stores

#### 3.1 RDS PostgreSQL

```bash
# Create RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier event-postgres-prod \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 15.3 \
  --master-username postgres \
  --master-user-password "YOUR_SECURE_PASSWORD" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --storage-encrypted \
  --multi-az \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00" \
  --vpc-security-group-ids sg-xxxxx \
  --db-subnet-group-name default \
  --publicly-accessible false \
  --region us-east-1
```

**Cost:** ~$70-100/month for db.t3.medium Multi-AZ

---

#### 3.2 ElastiCache Redis

```bash
# Create ElastiCache Redis cluster
aws elasticache create-replication-group \
  --replication-group-id event-redis-prod \
  --replication-group-description "Production Redis cluster" \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.t3.medium \
  --num-cache-clusters 2 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled \
  --security-group-ids sg-xxxxx \
  --cache-subnet-group-name default \
  --region us-east-1
```

**Cost:** ~$100-150/month for cache.t3.medium Multi-AZ

---

#### 3.3 Amazon OpenSearch (Elasticsearch)

```bash
# Create OpenSearch domain
aws opensearch create-domain \
  --domain-name event-search-prod \
  --engine-version OpenSearch_2.11 \
  --cluster-config \
    InstanceType=t3.medium.search,InstanceCount=3,DedicatedMasterEnabled=false,ZoneAwarenessEnabled=true,ZoneAwarenessConfig={AvailabilityZoneCount=3} \
  --ebs-options EBSEnabled=true,VolumeType=gp3,VolumeSize=100 \
  --access-policies '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "*"},
      "Action": "es:*",
      "Resource": "arn:aws:es:us-east-1:123456789012:domain/event-search-prod/*"
    }]
  }' \
  --encryption-at-rest-options Enabled=true \
  --node-to-node-encryption-options Enabled=true \
  --vpc-options SubnetIds=subnet-xxxxx,SecurityGroupIds=sg-xxxxx \
  --region us-east-1
```

**Cost:** ~$200-300/month for 3x t3.medium.search nodes

---

### Step 4: Store Secrets in AWS Secrets Manager

```bash
# Create secrets for sensitive data
aws secretsmanager create-secret \
  --name prod/event-system/db \
  --secret-string '{
    "username": "postgres",
    "password": "YOUR_DB_PASSWORD",
    "host": "event-postgres-prod.xxxxx.us-east-1.rds.amazonaws.com",
    "port": 5432,
    "database": "event_management"
  }' \
  --region us-east-1

aws secretsmanager create-secret \
  --name prod/event-system/redis \
  --secret-string '{
    "host": "event-redis-prod.xxxxx.cache.amazonaws.com",
    "port": 6379
  }' \
  --region us-east-1

aws secretsmanager create-secret \
  --name prod/event-system/smtp \
  --secret-string '{
    "user": "your_email@gmail.com",
    "password": "your_app_password",
    "from": "noreply@yourdomain.com"
  }' \
  --region us-east-1
```

**Cost:** $0.40 per secret per month

---

### Step 5: Create ECS Task Definitions

Create `task-definition-api.json`:

```json
{
  "family": "event-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/event-api:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "3000"}
      ],
      "secrets": [
        {"name": "DB_HOST", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/event-system/db:host::"},
        {"name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/event-system/db:password::"},
        {"name": "REDIS_HOST", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/event-system/redis:host::"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/event-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

Register task definitions:

```bash
aws ecs register-task-definition --cli-input-json file://task-definition-api.json
aws ecs register-task-definition --cli-input-json file://task-definition-worker.json
aws ecs register-task-definition --cli-input-json file://task-definition-mail-queue.json
aws ecs register-task-definition --cli-input-json file://task-definition-payment-service.json
```

---

### Step 6: Create ECS Cluster

```bash
# Create ECS cluster
aws ecs create-cluster \
  --cluster-name event-system-prod \
  --region us-east-1
```

---

### Step 7: Create Application Load Balancer

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name event-api-alb \
  --subnets subnet-xxxxx subnet-yyyyy \
  --security-groups sg-xxxxx \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --region us-east-1

# Create target group
aws elbv2 create-target-group \
  --name event-api-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxxxx \
  --target-type ip \
  --health-check-enabled \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --region us-east-1

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/event-api-alb/xxxxx \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/xxxxx \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/event-api-tg/xxxxx \
  --region us-east-1
```

---

### Step 8: Create ECS Services

```bash
# API Service (public-facing)
aws ecs create-service \
  --cluster event-system-prod \
  --service-name api \
  --task-definition event-api:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/event-api-tg/xxxxx,containerName=api,containerPort=3000" \
  --health-check-grace-period-seconds 60 \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}" \
  --enable-execute-command \
  --region us-east-1

# Worker Service (background jobs)
aws ecs create-service \
  --cluster event-system-prod \
  --service-name worker \
  --task-definition event-worker:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxx],assignPublicIp=DISABLED}" \
  --region us-east-1

# Mail Queue Service
aws ecs create-service \
  --cluster event-system-prod \
  --service-name mail-queue \
  --task-definition event-mail-queue:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxx],assignPublicIp=DISABLED}" \
  --region us-east-1

# Payment Service
aws ecs create-service \
  --cluster event-system-prod \
  --service-name payment-service \
  --task-definition event-payment-service:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxx],assignPublicIp=DISABLED}" \
  --region us-east-1
```

---

### Step 9: Configure Auto-Scaling

```bash
# API service auto-scaling
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/event-system-prod/api \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 3 \
  --max-capacity 10 \
  --region us-east-1

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/event-system-prod/api \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }' \
  --region us-east-1
```

---

## Cost Estimation (Monthly)

### Compute (ECS Fargate)
- API: 3 tasks × 0.5 vCPU × 1GB = ~$40
- Worker: 2 tasks × 0.5 vCPU × 1GB = ~$27
- Mail Queue: 2 tasks × 0.5 vCPU × 1GB = ~$27
- Payment: 2 tasks × 0.5 vCPU × 1GB = ~$27
**Subtotal: ~$120/month**

### Data Stores
- RDS PostgreSQL (db.t3.medium Multi-AZ): ~$80
- ElastiCache Redis (cache.t3.medium Multi-AZ): ~$120
- OpenSearch (3× t3.medium.search): ~$250
**Subtotal: ~$450/month**

### Networking & Other
- ALB: ~$20
- Data transfer: ~$20-50
- CloudWatch Logs: ~$10
- Secrets Manager: ~$2
**Subtotal: ~$50/month**

### **Total: ~$620-650/month**

---

## Alternative: Lower Cost Setup

For smaller workloads, use single-AZ and smaller instances:

- RDS: db.t3.micro = ~$15/month
- ElastiCache: cache.t3.micro = ~$13/month
- OpenSearch: 1× t3.small.search = ~$45/month
- ECS tasks: reduce to 1-2 tasks each

**Total: ~$150-200/month**

---

## CI/CD Pipeline (Optional)

### Using AWS CodePipeline

```yaml
# buildspec.yml
version: 0.2
phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
  build:
    commands:
      - echo Build started on `date`
      - docker build -t event-api ./api
      - docker tag event-api:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/event-api:latest
  post_build:
    commands:
      - echo Pushing image to ECR...
      - docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/event-api:latest
      - echo Updating ECS service...
      - aws ecs update-service --cluster event-system-prod --service api --force-new-deployment
```

---

## Monitoring & Logging

### CloudWatch Dashboards

```bash
# Create log groups
aws logs create-log-group --log-group-name /ecs/event-api --region us-east-1
aws logs create-log-group --log-group-name /ecs/event-worker --region us-east-1
aws logs create-log-group --log-group-name /ecs/event-mail-queue --region us-east-1
aws logs create-log-group --log-group-name /ecs/event-payment-service --region us-east-1

# Set retention
aws logs put-retention-policy --log-group-name /ecs/event-api --retention-in-days 30
```

### Key Metrics to Monitor
- ECS CPU/Memory utilization
- API response times (ALB metrics)
- RDS connections & queries
- Redis cache hit rate
- Queue depths (Bull queues)
- Payment processing success rate

---

## Security Best Practices

1. **VPC Configuration**
   - Place databases in private subnets
   - Use NAT Gateway for outbound traffic
   - Security groups with least privilege

2. **Secrets Management**
   - Store all credentials in Secrets Manager
   - Rotate secrets regularly
   - Use IAM roles, not access keys

3. **Encryption**
   - Enable encryption at rest (RDS, Redis, OpenSearch)
   - Use SSL/TLS for all connections
   - HTTPS only for ALB

4. **Access Control**
   - Use IAM roles for ECS tasks
   - Implement API authentication (JWT)
   - Enable VPC Flow Logs

5. **Compliance**
   - Enable CloudTrail for audit logs
   - Regular security scanning (AWS Inspector)
   - Backup automation

---

## Next Steps

1. ✅ Set up AWS account and billing alerts
2. ✅ Create VPC with public/private subnets
3. ✅ Build and push Docker images to ECR
4. ✅ Create RDS, ElastiCache, OpenSearch
5. ✅ Store secrets in Secrets Manager
6. ✅ Deploy ECS services
7. ✅ Configure ALB and Route 53
8. ✅ Set up CloudWatch monitoring
9. ✅ Enable auto-scaling
10. ✅ Configure CI/CD pipeline

---

## Troubleshooting

**Service won't start:**
```bash
# Check ECS service events
aws ecs describe-services --cluster event-system-prod --services api

# Check task logs
aws logs tail /ecs/event-api --follow
```

**Database connection issues:**
```bash
# Test from within ECS task
aws ecs execute-command \
  --cluster event-system-prod \
  --task <task-id> \
  --container api \
  --interactive \
  --command "/bin/bash"

# Then inside container:
nc -zv event-postgres-prod.xxxxx.us-east-1.rds.amazonaws.com 5432
```

---

## Summary

Your microservices architecture is well-suited for AWS ECS Fargate with managed data stores. This provides:

✅ **High Availability** - Multi-AZ deployment
✅ **Scalability** - Auto-scaling based on load
✅ **Security** - VPC isolation, encryption, secrets management
✅ **Reliability** - Managed services with automatic failover
✅ **Cost-Effective** - Pay only for what you use

Estimated cost: **$150-650/month** depending on scale.
