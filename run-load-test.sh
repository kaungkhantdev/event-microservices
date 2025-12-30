#!/bin/bash

# Load Testing Script
# Quick wrapper for running k6 load tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL=${API_URL:-http://localhost:3000}
TEST_USER_EMAIL=${TEST_USER_EMAIL:-loadtest@test.com}
TEST_USER_PASSWORD=${TEST_USER_PASSWORD:-LoadTest123!}

# Functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_k6() {
    if ! command -v k6 &> /dev/null; then
        print_error "k6 is not installed"
        echo ""
        echo "Install k6:"
        echo "  macOS:   brew install k6"
        echo "  Linux:   See https://k6.io/docs/getting-started/installation"
        echo "  Docker:  Use the docker version of this script"
        exit 1
    fi
    print_success "k6 is installed"
}

check_api() {
    print_info "Checking API health at $API_URL..."

    if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
        print_success "API is healthy"
        return 0
    else
        print_error "API is not responding at $API_URL"
        echo ""
        echo "Make sure your services are running:"
        echo "  docker-compose up -d"
        exit 1
    fi
}

show_menu() {
    print_header "Load Testing Menu"
    echo "1) Authentication Flow Test (Users: register, login, forgot password)"
    echo "2) Payment Flow Test (Authenticated payment processing)"
    echo "3) Email Priority Test (Verify Priority 1 emails are processed first)"
    echo "4) Quick Smoke Test (10 users, 1 minute)"
    echo "5) Stress Test (100 users, 5 minutes)"
    echo "6) Run All Tests"
    echo "7) Check System Status"
    echo "8) Exit"
    echo ""
}

run_auth_flow() {
    print_header "Running Authentication Flow Test"
    print_info "This will test registration, login, and forgot password flows"
    print_info "Target: 100 concurrent users over 13 minutes"
    echo ""

    API_URL=$API_URL k6 run load-tests/auth-flow.k6.js

    print_success "Test completed!"
}

run_payment_flow() {
    print_header "Running Payment Flow Test"
    print_info "This will test authenticated payment processing"
    print_info "Target: 50 concurrent users over 8 minutes"
    echo ""

    # Create test user if doesn't exist
    print_info "Creating test user..."
    curl -s -X POST "$API_URL/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_USER_EMAIL\",\"name\":\"Load Test User\",\"password\":\"$TEST_USER_PASSWORD\"}" \
        > /dev/null 2>&1 || true

    API_URL=$API_URL \
    TEST_USER_EMAIL=$TEST_USER_EMAIL \
    TEST_USER_PASSWORD=$TEST_USER_PASSWORD \
    k6 run load-tests/payment-flow.k6.js

    print_success "Test completed!"
}

run_email_priority() {
    print_header "Running Email Priority Test"
    print_info "This will verify Priority 1 emails are processed faster"
    print_info "Forgot password (Priority 1): 50 req/s"
    print_info "Registration (Priority 3): 100 req/s"
    echo ""

    print_warning "Watch the mail queue logs in another terminal:"
    print_info "docker-compose logs -f mail-queue"
    echo ""
    read -p "Press Enter to continue..."

    API_URL=$API_URL k6 run load-tests/email-priority.k6.js

    print_success "Test completed!"
}

run_smoke_test() {
    print_header "Running Quick Smoke Test"
    print_info "Quick test with 10 users for 1 minute"
    echo ""

    API_URL=$API_URL k6 run --vus 10 --duration 1m load-tests/auth-flow.k6.js

    print_success "Smoke test completed!"
}

run_stress_test() {
    print_header "Running Stress Test"
    print_warning "This will run with 100 concurrent users for 5 minutes"
    print_warning "Make sure your system can handle this load!"
    echo ""
    read -p "Continue? (y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        API_URL=$API_URL k6 run --vus 100 --duration 5m load-tests/auth-flow.k6.js
        print_success "Stress test completed!"
    else
        print_info "Stress test cancelled"
    fi
}

run_all_tests() {
    print_header "Running All Tests"
    print_warning "This will take approximately 25 minutes"
    echo ""
    read -p "Continue? (y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        run_smoke_test
        sleep 5
        run_auth_flow
        sleep 5
        run_payment_flow
        sleep 5
        run_email_priority

        print_success "All tests completed!"
    else
        print_info "Tests cancelled"
    fi
}

check_system_status() {
    print_header "System Status"

    # Check Docker services
    print_info "Docker Services:"
    docker-compose ps

    echo ""

    # Check API health
    print_info "API Health:"
    curl -s "$API_URL/health" | jq '.' 2>/dev/null || echo "API not responding"

    echo ""

    # Check Redis queue depth
    print_info "Redis Queue Depth:"
    docker-compose exec -T redis redis-cli LLEN bull:mail:wait 2>/dev/null || echo "Redis not available"

    echo ""

    # Check system resources
    print_info "System Resources:"
    docker stats --no-stream 2>/dev/null || echo "Docker stats not available"
}

# Main script
clear
print_header "Load Testing Tool for Microservices System"

print_info "Configuration:"
echo "  API URL: $API_URL"
echo "  Test User: $TEST_USER_EMAIL"
echo ""

# Check prerequisites
check_k6
check_api

# Show menu and handle selection
while true; do
    show_menu
    read -p "Select option (1-8): " choice

    case $choice in
        1)
            run_auth_flow
            ;;
        2)
            run_payment_flow
            ;;
        3)
            run_email_priority
            ;;
        4)
            run_smoke_test
            ;;
        5)
            run_stress_test
            ;;
        6)
            run_all_tests
            ;;
        7)
            check_system_status
            ;;
        8)
            print_info "Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid option"
            ;;
    esac

    echo ""
    read -p "Press Enter to continue..."
    clear
done
