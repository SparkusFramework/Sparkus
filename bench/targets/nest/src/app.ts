// Idiomatic NestJS: module, injectable service, DTO validated by class-validator.
import "reflect-metadata";
import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Query, ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { IsInt, IsString, Length, Max, Min } from "class-validator";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "127.0.0.1";

class CreateUserDto {
    @IsString()
    @Length(1, 100)
    name: string;

    @IsInt()
    @Min(0)
    @Max(150)
    age: number;
}

@Injectable()
class UserService {
    find(id: string) {
        return { id, name: "User " + id };
    }
}

@Controller()
class HelloController {
    @Get()
    hello() {
        return { hello: "world" };
    }
}

@Controller("users")
class UserController {
    constructor(private readonly users: UserService) {}

    @Get(":id")
    get(@Param("id") id: string, @Query("fields") fields?: string) {
        return { ...this.users.find(id), fields: fields ?? null };
    }

    @Post()
    @HttpCode(201)
    create(@Body() dto: CreateUserDto) {
        return { id: 1, name: dto.name, age: dto.age };
    }
}

@Module({ controllers: [HelloController, UserController], providers: [UserService] })
export class AppModule {}

export async function start(app: INestApplication): Promise<void> {
    app.useGlobalPipes(new ValidationPipe());
    await app.listen(PORT, HOST);
}
