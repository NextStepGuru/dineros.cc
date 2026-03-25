#!/bin/bash

# Build and test script for dineros.cc project
# Tests both main project and microservice Dockerfiles

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        error "Docker is not running or not accessible"
        exit 1
    fi
    success "Docker is running"
}

# Function to build and test main project
build_main_project() {
    log "Building main project Dockerfile..."

    # Build the image
    docker build -f app/Dockerfile -t dineros-main:test .

    if [ $? -eq 0 ]; then
        success "Main project Docker image built successfully"
    else
        error "Failed to build main project Docker image"
        return 1
    fi

    # Test the container can start (basic test)
    log "Testing main project container startup..."
    docker run --rm -d \
        --name dineros-main-test \
        -p 3000:3000 \
        -e DB_ENCRYPTION_KEY=k1.aesgcm256.yQcdOV0BPCyRNiFasjXX5kqelCifs2jpp70GbLrao4c= \
        -e PLAID_CLIENT_ID=dummy \
        -e PLAID_SECRET=dummy \
        -e POSTMARK_SERVER_TOKEN=dummy \
        -e JWT_SECRET=dummy \
        dineros-main:test

    if [ $? -eq 0 ]; then
        success "Main project container started successfully"
        # Give it a second to start up
        sleep 3

        # Check if container is still running
        if docker ps | grep -q dineros-main-test; then
            success "Main project container is running"
            # Stop the container
            docker stop dineros-main-test
            success "Main project container stopped"
        else
            error "Main project container failed to stay running"
            log "Container logs:"
            docker logs dineros-main-test 2>/dev/null || log "No logs available"
            return 1
        fi
    else
        error "Failed to start main project container"
        return 1
    fi
}

# Function to build and test microservice
build_microservice() {
    log "Building microservice Dockerfile..."

    # Ensure microservice has synced Prisma + shared redis client
    (cd microservice && ./copy-files.sh)

    # Build the image
    docker build -f microservice/Dockerfile -t dineros-microservice:test .

    if [ $? -eq 0 ]; then
        success "Microservice Docker image built successfully"
    else
        error "Failed to build microservice Docker image"
        return 1
    fi

    # Test the container can start (basic test)
    log "Testing microservice container startup..."
    docker run --rm -d --name dineros-microservice-test -p 3001:3000 \
        -e DB_ENCRYPTION_KEY=k1.aesgcm256.yQcdOV0BPCyRNiFasjXX5kqelCifs2jpp70GbLrao4c= \
        -e NODE_ENV=test \
        -e DATABASE_URL=mysql://root:password@host.docker.internal:3306/linearbudget \
        dineros-microservice:test

    if [ $? -eq 0 ]; then
        success "Microservice container started successfully"
        # Give it a second to start up
        sleep 3

        # Check if container is still running
        if docker ps | grep -q dineros-microservice-test; then
            success "Microservice container is running"
            # Stop the container
            docker stop dineros-microservice-test
            success "Microservice container stopped"
        else
            error "Microservice container failed to stay running"
            return 1
        fi
    else
        error "Failed to start microservice container"
        return 1
    fi

}

# Function to clean up test images
cleanup() {
    log "Cleaning up test images..."

    # Remove test containers if they exist
    docker rm -f dineros-main-test 2>/dev/null || true
    docker rm -f dineros-microservice-test 2>/dev/null || true

    # Remove test images
    docker rmi dineros-main:test 2>/dev/null || true
    docker rmi dineros-microservice:test 2>/dev/null || true

    success "Cleanup completed"
}

# Main execution
main() {
    log "Starting Docker build tests for dineros.cc project"

    # Check if Docker is available
    check_docker

    # Clean up any existing test containers/images
    cleanup

    # Build and test main project
    if build_main_project; then
        success "Main project build test PASSED"
    else
        error "Main project build test FAILED"
        cleanup
        exit 1
    fi

    # Build and test microservice
    if build_microservice; then
        success "Microservice build test PASSED"
    else
        error "Microservice build test FAILED"
        cleanup
        exit 1
    fi

    # Clean up
    cleanup

    log "All build tests completed successfully!"
    success "Both Dockerfiles are working correctly"
}

# Handle script interruption
trap cleanup EXIT

# Run main function
main "$@"
