import { Controller, Get, HttpError, inject, t, type Ctx } from "sparkus";
import { ItemService } from "./items.service.js";

const GetItem = { params: t.object({ id: t.integer({ min: 1 }) }) };

@Controller("/items")
export class ItemController {
    private readonly items = inject(ItemService);

    @Get("/:id", GetItem)
    get(ctx: Ctx<typeof GetItem>) {
        const item = this.items.find(ctx.params.id);
        if (item === undefined) throw HttpError.notFound(`No item ${ctx.params.id}`, { code: "ITEM_NOT_FOUND" });
        return item;
    }
}
