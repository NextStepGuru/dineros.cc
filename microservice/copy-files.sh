#!/bin/bash
#
ls -alh .
rm -rf ./prisma
cp -r ../app/prisma ./
cp ../app/server/clients/redisClient.ts ./clients
