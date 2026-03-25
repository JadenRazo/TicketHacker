import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { portalVerifyToken } from '../../lib/api';

type VerifyState = 'verifying' | 'success' | 'error';

export default function PortalVerifyPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<VerifyState>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token || !tenantSlug) {
      setState('error');
      setErrorMessage('The login link is missing required information. Please request a new one.');
      return;
    }

    portalVerifyToken(tenantSlug, token)
      .then(({ contact, sessionToken }) => {
        localStorage.setItem('portalToken', sessionToken);
        localStorage.setItem('portalContact', JSON.stringify(contact));
        setState('success');
        // Give the user a moment to see the success state before redirecting
        setTimeout(() => {
          navigate(`/portal/${tenantSlug}/tickets`, { replace: true });
        }, 800);
      })
      .catch((err: Error) => {
        setState('error');
        setErrorMessage(
          err.message || 'This login link is invalid or has expired. Please request a new one.',
        );
      });
  }, [tenantSlug, searchParams, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          {state === 'verifying' && (
            <>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-4">
                <svg
                  className="w-6 h-6 text-blue-600 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Verifying your link</h2>
              <p className="text-sm text-gray-500">Just a moment...</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Signed in</h2>
              <p className="text-sm text-gray-500">Redirecting you to your tickets...</p>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Link expired or invalid</h2>
              <p className="text-sm text-gray-500 mb-6">{errorMessage}</p>
              <a
                href={tenantSlug ? `/portal/${tenantSlug}` : '/'}
                className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Request a new link
              </a>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Powered by TicketHacker</p>
      </div>
    </div>
  );
}
