# Lyle
Test user allocator

### Overview

This service provides a mechanism for allocating temporary service accounts, which can then be used
to log into Terra from automated tests scripts. Each service account has a unique email address,
which can help keep test cases separate from one another.

[API docs](https://terra-lyle.appspot.com/docs)

### Typical usage

1. Call `create` to generate a new service account and return its email.
2. Call `token` to generate an access token for the new service account. Use the access token to log into Terra.
3. Call `delete` when finished, to delete the service account. However, even if this does not happen, the service account will be cleaned up automatically after 1 hour.

### Authentication

All endpoints require an OpenID Connect ID token for the service account `lyle-user@terra-lyle.iam.gserviceaccount.com`.
A private key for that service account is stored in Vault at the path `secret/dsde/terra/envs/common/lyle-user-service-account-key`.

To generate a token, create a JWT with the additional claim `target_audience: 'https://terra-lyle.appspot.com'`,
sign it with the private key, and pass it to Google's OAuth2 `token` endpoint. Using one of Google's client libraries will make this easier.

Pass the token in a header with every call: `Authorization: Bearer <token>`

### Developing

Note that there is currently no separate development environment, so any changes will affect the real system. Use caution.

Download a key for the app engine default service account, `terra-lyle@appspot.gserviceaccount.com`. Note the file location.

Install deps
```sh
npm install
```

Build docs
```sh
npm run generate-docs
```

Start a dev server on port 8080 with auto-reload
```sh
GCP_PROJECT=terra-lyle GOOGLE_APPLICATION_CREDENTIALS=<path-to-key-file> npm run start-dev
```

Lint
```sh
npm run lint
```

Deploy
```sh
scripts/deploy.sh
```
