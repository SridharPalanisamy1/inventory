#!/bin/bash

cd /var/www/vhosts/yenerp.com/api/inventorytestapi/app

nohup uvicorn inventorytestapi:app \
  --host 127.0.0.1 \
  --port 8012 \
  --workers 2 \
  --log-level warning \
  --ws-ping-interval 30 \
  --ws-ping-timeout 30 \
  --proxy-headers \
  --forwarded-allow-ips="*" \
  --timeout-keep-alive 30 \
  > /var/www/vhosts/yenerp.com/api/inventorytestapi/app/inventorytestapi.log 2>&1 &