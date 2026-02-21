.PHONY: up dn uplogs start stop restart status logs clean

HOST := 192.168.219.3
PORT := 44044
DATA_DIR := .

up: start
dn: stop
down: stop

uplogs: up logs

start:
	@tex-serve serve $(DATA_DIR) --host $(HOST) --port $(PORT) \
		--allow-non-localhost-access-with-plaintext-transmission-risk -y
	@echo "服务已启动: http://$(HOST):$(PORT)"

stop:
	@tex-serve stop || echo "服务已停止或未运行"

restart: dn up

status:
	@tex-serve status || echo "服务未运行"

logs:
	@tail -f $(DATA_DIR)/web.log

clean:
	@rm -rf ./data ./projects ./.pulse_tex.lock ./web.log || echo "文件已清理"
