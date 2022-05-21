[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![NPM Version](https://img.shields.io/npm/v/@jaspero/cli.svg)](https://www.npmjs.com/package/@jaspero/cli)
[![Release](https://github.com/Jaspero/cli/actions/workflows/release.yml/badge.svg)](https://github.com/Jaspero/cli/actions/workflows/release.yml)

# Jaspero CLI

Development tool specialized for [JMS](https://github.com/Jaspero/jms).

## Getting started

Install the CLI globally.

```
npm i -g @jaspero/cli
```

Now you can use it to set up a new/existing firebase project and github repo for JMS.

```
jaspero jms init
```

**Note:** In order to set secrets on a repo during `jms init` you'll need [Github CLI](https://cli.github.com/) installed.
