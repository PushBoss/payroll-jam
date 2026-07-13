import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icons } from '../Icons';
import { dimePayService } from '../../services/dimePayService';

export interface CardTokenizeResult {
    cardToken: string;
    cardRequestToken?: string;
    cardLast4?: string;
    cardBrand?: string;
    cardExpiry?: string;
}

interface CardRequestInitResponse {
    card_url?: string;
    card_request_token?: string;
    token?: string;
    client_key?: string;
    client_id?: string;
    environment?: 'sandbox' | 'production';
}

interface CardTokenizeCardProps {
    /** Starts the DimePay card-request flow (server-side) and returns the hosted form/SDK details. */
    initiate: () => Promise<CardRequestInitResponse>;
    /** Called once DimePay confirms the card is verified/tokenized - persist it however the caller needs. */
    onVerified: (result: CardTokenizeResult) => Promise<void>;
    onSuccess: () => void | Promise<void>;
    /** Override to avoid DOM id collisions if more than one DimePay widget could ever be mounted at once. */
    mountId?: string;
    successToast?: string;
}

/**
 * Shared body for "tokenize a card via DimePay's hosted card-request flow" - used by
 * Settings' PaymentMethodModal (add/update a saved card) and Signup's bank-transfer step
 * (a card is required on file even when paying this cycle by transfer). Renders no modal
 * chrome of its own so callers can embed it in a modal or inline.
 */
export const CardTokenizeCard: React.FC<CardTokenizeCardProps> = ({
    initiate,
    onVerified,
    onSuccess,
    mountId = 'dimepay-card-widget',
    successToast = 'Card saved successfully.'
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isApplying, setIsApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cardUrl, setCardUrl] = useState<string | null>(null);
    const [cardRequestToken, setCardRequestToken] = useState<string | null>(null);
    const [cardClientKey, setCardClientKey] = useState<string | null>(null);
    const [cardEnvironment, setCardEnvironment] = useState<'sandbox' | 'production'>('sandbox');
    const [verificationStatus, setVerificationStatus] = useState<string>('Initializing secure card form...');
    const [verificationSignal, setVerificationSignal] = useState(0);
    const appliedRef = useRef(false);

    const persistVerifiedCard = async (details: any) => {
        const cardToken = details.token || details.card_token;
        if (!cardToken) {
            throw new Error('Verified card token was not returned by DimePay.');
        }

        await onVerified({
            cardToken,
            cardRequestToken: details.card_request_token || cardRequestToken || undefined,
            cardLast4: details.last_four_digits || details.card_last4 || details.card_last_four,
            cardBrand: details.card_scheme || details.card_brand,
            cardExpiry: details.card_expiry
        });
    };

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            try {
                const data = await initiate();
                if (cancelled) return;

                setCardUrl(data.card_url || null);
                setCardRequestToken(data.card_request_token || data.token || null);
                setCardClientKey(data.client_key || data.client_id || null);
                setCardEnvironment(data.environment === 'production' ? 'production' : 'sandbox');
                setVerificationStatus('Complete verification in the secure form below.');
            } catch (requestError: any) {
                if (!cancelled) {
                    setError(requestError.message || 'Failed to initialize card verification.');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void init();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!cardRequestToken || appliedRef.current) return;

        let cancelled = false;

        const poll = async () => {
            try {
                const details = await dimePayService.getCardDetails(cardRequestToken, cardEnvironment);
                if (cancelled) return;

                const status = details.status || 'PENDING';
                setVerificationStatus(
                    status === 'SUCCESS'
                        ? 'Card verified. Saving payment method...'
                        : 'Waiting for DimePay verification...'
                );

                if (status === 'SUCCESS' && details.token && !appliedRef.current) {
                    appliedRef.current = true;
                    setIsApplying(true);
                    await persistVerifiedCard(details);

                    if (!cancelled) {
                        toast.success(successToast);
                        await onSuccess();
                    }
                }
            } catch (pollError: any) {
                if (!cancelled) {
                    setVerificationStatus(pollError.message || 'Waiting for card verification...');
                }
            } finally {
                if (!cancelled) {
                    setIsApplying(false);
                }
            }
        };

        void poll();
        const interval = window.setInterval(() => void poll(), 3000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardRequestToken, verificationSignal]);

    useEffect(() => {
        if (!cardRequestToken) return;

        const handleCardReturn = (event: MessageEvent) => {
            if (event.data?.type !== 'dimepay-card-return') return;
            setVerificationStatus('Verification submitted. Saving card details...');
            setVerificationSignal(Date.now());
        };

        window.addEventListener('message', handleCardReturn);
        return () => window.removeEventListener('message', handleCardReturn);
    }, [cardRequestToken]);

    useEffect(() => {
        if (!cardRequestToken || !cardClientKey || cardUrl || isLoading || error) return;

        let cancelled = false;
        let timer: number | undefined;

        const mountCardWidget = () => {
            if (cancelled) return;

            const mountElement = document.getElementById(mountId);
            const dimepaySDK = (window as any).dimepay || (window as any).DimePay;

            if (!mountElement || !dimepaySDK?.initCard) {
                timer = window.setTimeout(mountCardWidget, 150);
                return;
            }

            try {
                dimepaySDK.initCard({
                    mountId,
                    card_request_token: cardRequestToken,
                    client_id: cardClientKey,
                    origin: window.location.origin,
                    test: cardEnvironment !== 'production',
                    styles: {
                        primaryColor: '#FFA500',
                        buttonColor: '#000000',
                        buttonTextColor: '#FFFFFF',
                        backgroundColor: '#FFFFFF'
                    },
                    onReady: () => {
                        if (!cancelled) setVerificationStatus('Complete verification in the secure form below.');
                    },
                    onSuccess: async () => {
                        if (cancelled || appliedRef.current) return;
                        appliedRef.current = true;
                        setIsApplying(true);
                        const details = await dimePayService.getCardDetails(cardRequestToken, cardEnvironment);
                        await persistVerifiedCard(details);
                        toast.success(successToast);
                        await onSuccess();
                    },
                    onFailed: (err: any) => {
                        if (!cancelled) setVerificationStatus(err?.message || 'Card verification failed.');
                    },
                    onError: (err: any) => {
                        if (!cancelled) setVerificationStatus(err?.message || 'Card verification could not be completed.');
                    },
                    onLoading: () => {
                        if (!cancelled) setVerificationStatus('Loading secure card form...');
                    }
                });
            } catch (sdkError: any) {
                if (!cancelled) {
                    setError(sdkError.message || 'Failed to load secure card form.');
                }
            }
        };

        mountCardWidget();

        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
            const mountElement = document.getElementById(mountId);
            if (mountElement) mountElement.innerHTML = '';
        };
    }, [cardRequestToken, cardClientKey, cardUrl, cardEnvironment, isLoading, error, mountId, successToast]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <div>
                    <p className="text-sm font-semibold text-gray-900">Verification status</p>
                    <p className="text-xs text-gray-500 mt-1">{verificationStatus}</p>
                </div>
                {isApplying && <Icons.Refresh className="w-5 h-5 text-jam-orange animate-spin" />}
            </div>

            {isLoading ? (
                <div className="h-[480px] flex flex-col items-center justify-center text-center">
                    <Icons.Refresh className="w-8 h-8 animate-spin text-jam-orange mb-3" />
                    <p className="text-sm text-gray-600">Preparing secure card verification...</p>
                </div>
            ) : error ? (
                <div className="h-[240px] flex flex-col items-center justify-center text-center">
                    <Icons.Alert className="w-10 h-10 text-red-500 mb-3" />
                    <p className="text-red-600 font-medium mb-2">Unable to start card verification</p>
                    <p className="text-xs text-gray-500 max-w-md">{error}</p>
                </div>
            ) : cardUrl ? (
                <>
                    <iframe
                        src={cardUrl}
                        title="DimePay card verification"
                        className="w-full h-[520px] rounded-lg border border-gray-200"
                    />
                    <div className="flex justify-between items-center text-xs text-gray-500">
                        <span>If the secure form does not load, open it in a new tab.</span>
                        <a
                            href={cardUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-jam-orange font-semibold hover:underline"
                        >
                            Open verification page
                        </a>
                    </div>
                </>
            ) : cardRequestToken && cardClientKey ? (
                <div
                    id={mountId}
                    className="w-full min-h-[520px] rounded-lg border border-gray-200 bg-white overflow-hidden"
                />
            ) : (
                <div className="h-[240px] flex flex-col items-center justify-center text-center">
                    <Icons.Alert className="w-10 h-10 text-yellow-500 mb-3" />
                    <p className="text-gray-800 font-medium mb-2">Card form is not ready yet</p>
                    <p className="text-xs text-gray-500 max-w-md">
                        DimePay returned no hosted form URL or SDK client key. Check the card-request response and DimePay credentials.
                    </p>
                </div>
            )}
        </div>
    );
};
