import { Redirect } from 'expo-router';
import { homeFor, useAuth } from '../src/store/auth.store';

/** The entry point: send the user to sign-in, or to the home of their role. */
export default function Index() {
  const user = useAuth((s) => s.user);
  return <Redirect href={(user ? homeFor(user.role) : '/(auth)/login') as never} />;
}
