import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const email = params.get('email');
    const id = params.get('id');
    const name = params.get('name');

    if (!accessToken || !email || !id) {
      navigate('/login');
      return;
    }

    setSession({
      accessToken,
      user: {
        id,
        email,
        name,
      },
    });
    navigate('/dashboard');
  }, [navigate, params, setSession]);

  return <div className="p-8 text-center text-sm">Completing sign-in...</div>;
}
