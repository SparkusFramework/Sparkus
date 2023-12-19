<div align="center">
    <img src="./.github/banner.svg" width="400px">
    <h1>Sparkus ✨</h1>
</div>

<p align="center">
This ESM-based framework empowers you to build vast and scalable backend solutions. 
Drawing inspiration from Spring and Quarkus, Sparkus combines the dynamic world of 
JavaScript with robust, enterprise-ready architectures. Unleash the power of modern 
Server-side JavaScript / TypeScript, keep your project organized and your code maintainable
withoutsacrificing the speed and flexibility.

<p align="center">
✨ With Sparkus, scale effortlessly and keep the spark alive in your backend development journey. ✨
</p>

<br>

---

## Installation

You can install Sparkus with npm:

```
npm install sparkus
```

or with yarn:

```
yarn add sparkus
```

## Basic Usage

Here's a simple example of a Sparkus application:

```ts
// ./app.ts
import { App } from "sparkus/core";

// Bootstrap of your app
new App({
  // Folder to be scanned for automatic imports
  scan: [
    './src/controllers',
    './src/services',
  ],
  // The port needed your application
  port: 8080,
  // Automatically reload your files on save (enable this for development)
  watch: true
}).start();
```

```ts
// ./src/controllers/account.controller.ts
import { Controller, GET, Inject, InitLogger, POST } from "sparkus/decorators";
import { Logger } from "sparkus/utils";
import AccountService from "../services/account.service.js";

@Controller('/api/v1/account')
export default class AccountController {

    @InitLogger() // Automatically initialize the logger
    private logger: Logger;

    @Inject() // Automatically inject the service "accountService"
    private accountService: AccountService;

    @GET() // /api/v1/account
    public index(): any {
        const users = this.accountService.findAllUsers();
        return { hello: users };
    }

    @POST('/just/an/example') // /api/v1/account/just/an/example
    public create(): any {
        return { good: 'bye!' };
    }

}
```

```ts
// ./src/services/account.service.ts
import { Injectable } from "sparkus/decorators";

@Injectable('accountService')
export default class AccountService {

    public findAllUsers(): string[] {
        return ["Max", "Jeff", "Maria"]
    }

}
```


## Documentation

> Soon...

## Contributing

> Soon...

## License

Sparkus is [MIT licensed](https://github.com/maxand-re/Sparkus/blob/main/LICENSE).
