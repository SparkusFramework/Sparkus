export class ItemService {
    private readonly items = [
        { id: 1, name: "one" },
        { id: 2, name: "two" },
    ];

    find(id: number) {
        return this.items.find((item) => item.id === id);
    }
}
