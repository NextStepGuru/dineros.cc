#!/bin/bash
#
ls -alh .
rm -rf ./prisma
cp -r ../prisma ./
cp ../server/clients/redisClient.ts ./clients
