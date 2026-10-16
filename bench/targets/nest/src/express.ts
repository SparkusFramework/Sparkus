import { NestFactory } from "@nestjs/core";
import { AppModule, start } from "./app";

NestFactory.create(AppModule, { logger: false }).then(start);
