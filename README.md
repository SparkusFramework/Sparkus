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
import {App} from "sparkus/core";

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
import {InjectLogger, Controller, GET, POST} from "sparkus/decorators";
import {Logger} from "sparkus/utils";

@InjectLogger
@Controller('/api/account')
export default class AccountController {

  private logger: Logger;

  @GET()
  public index(): { hello: string } {
    this.logger.info('The logger is automatically injected and configured with @InjectLogger');
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
