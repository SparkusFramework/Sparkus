import { Controller, Get, inject } from "../../../../../src/index.js";
import { UserService } from "./users.service.js";

@Controller("/users")
export class UserController {
    private readonly users = inject(UserService);

    @Get()
    list() {
        return this.users.list();
    }
}
