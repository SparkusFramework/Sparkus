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
import { Sparkus } from 'sparkus'

await new Sparkus({
    scan: [
        new URL('./src/controllers', import.meta.url),
        new URL('./src/services', import.meta.url)
    ],
    port: 8080
}).start();
```

```ts
// ./src/controllers/account.controller.ts
import {Controller, GET, POST, Logger, SparkusLogger} from "sparkus";

@Logger
@Controller('/api/account')
export default class AccountController {

    private logger: SparkusLogger;

    @GET('/hello')
    public index(): { hello: string } {
        return { hello: 'world!' };
    }

    @POST()
    public create(): { good: string } {
        return { good: 'bye!' };
    }
}
```
## Documentation

> Soon...

## Contributing

> Soon...

## License

Sparkus is [MIT licensed](https://github.com/maxand-re/Sparkus/blob/main/LICENSE).