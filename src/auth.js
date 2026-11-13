import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

const website = 'https://d2ewapchu870nh.cloudfront.net';

const manager = new UserManager({
  authority: 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_1FDmivh02',
  metadata: {
    issuer: 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_1FDmivh02',
    authorization_endpoint:
      'https://us-east-21fdmivh02.auth.us-east-2.amazoncognito.com/oauth2/authorize',
    token_endpoint:
      'https://us-east-21fdmivh02.auth.us-east-2.amazoncognito.com/oauth2/token',
    userinfo_endpoint:
      'https://us-east-21fdmivh02.auth.us-east-2.amazoncognito.com/oauth2/userInfo',
    end_session_endpoint:
      'https://us-east-21fdmivh02.auth.us-east-2.amazoncognito.com/logout',
    jwks_uri:
      'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_1FDmivh02/.well-known/jwks.json'
  },
  client_id: '5a5vliehdl6ek4et6cqc9u1b7l',
  redirect_uri: website,
  post_logout_redirect_uri: website,
  response_type: 'code',
  scope: 'openid email',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: false
});

export async function signIn() {
  await manager.signinRedirect();
}

export async function completeSignIn() {
  if (new URLSearchParams(window.location.search).has('code')) {
    await manager.signinRedirectCallback();
    window.history.replaceState({}, '', '/');
  }

  return manager.getUser();
}

export async function getAccessToken() {
  const user = await manager.getUser();
  return user && !user.expired ? user.access_token : null;
}

export async function signOut() {
  const cognitoDomain =
    'https://us-east-21fdmivh02.auth.us-east-2.amazoncognito.com';

  const clientId = '5a5vliehdl6ek4et6cqc9u1b7l';

  // Clear the local authentication session first.
  await manager.removeUser();

  // Redirect to Cognito's supported logout endpoint.
  const logoutUrl = new URL(`${cognitoDomain}/logout`);

  logoutUrl.searchParams.set('client_id', clientId);
  logoutUrl.searchParams.set(
    'logout_uri',
    'https://d2ewapchu870nh.cloudfront.net'
  );

  window.location.assign(logoutUrl.toString());
}
