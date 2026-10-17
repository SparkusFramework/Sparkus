import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule, start } from "./app";

NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false }).then(start);
