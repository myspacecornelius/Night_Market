import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Zap } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    BOOST_DEFAULT_AMOUNT,
    BOOST_MAX_AMOUNT,
    BOOST_MIN_AMOUNT,
    PostsAPI,
} from '@/lib/api/posts';
import type { PostBoostResult } from '@/lib/api/posts';

type KarmaBarProps = {
    postId: string;
    /** The post's boost score: the LACES spent boosting it so far. */
    score: number;
    /** False on the viewer's own posts: the API refuses a boost of your own post. */
    canBoost: boolean;
    onBoosted: (result: PostBoostResult) => void;
    /** The boost was refused or could not be sent (the reason is already shown here). */
    onBoostFailed?: (error: Error) => void;
};

const numberFormat = new Intl.NumberFormat('en-US');

/**
 * The karma of a post is its boost score. Other people's posts can be boosted from here
 * with a chosen amount of LACES.
 */
export const KarmaBar = ({ postId, score, canBoost, onBoosted, onBoostFailed }: KarmaBarProps) => {
    const amountId = useId();
    const problemId = useId();
    const [isChoosingAmount, setIsChoosingAmount] = useState(false);
    const [amount, setAmount] = useState(String(BOOST_DEFAULT_AMOUNT));
    const [amountError, setAmountError] = useState<string | null>(null);

    // When the amount form goes away, the keyboard focus returns to the button that opened it.
    const boostButtonRef = useRef<HTMLButtonElement>(null);
    const wasChoosingAmount = useRef(false);
    useEffect(() => {
        if (wasChoosingAmount.current && !isChoosingAmount) boostButtonRef.current?.focus();
        wasChoosingAmount.current = isChoosingAmount;
    }, [isChoosingAmount]);

    const boost = useMutation({
        mutationFn: (laces: number) => PostsAPI.boostPost(postId, laces),
        onSuccess: (result) => {
            setIsChoosingAmount(false);
            onBoosted(result);
        },
        onError: (error) => onBoostFailed?.(error),
    });

    const openForm = () => {
        boost.reset();
        setAmountError(null);
        setIsChoosingAmount(true);
    };

    const closeForm = () => {
        boost.reset();
        setAmountError(null);
        setIsChoosingAmount(false);
    };

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const laces = Number(amount);
        if (!Number.isInteger(laces) || laces < BOOST_MIN_AMOUNT || laces > BOOST_MAX_AMOUNT) {
            setAmountError(`Enter a whole number from ${BOOST_MIN_AMOUNT} to ${BOOST_MAX_AMOUNT}.`);
            return;
        }
        setAmountError(null);
        boost.mutate(laces);
    };

    const problem = amountError ?? (boost.isError ? boost.error.message : null);

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Zap className="h-4 w-4 text-yellow-500" aria-hidden="true" />
                    <span className="text-base font-semibold text-foreground">{numberFormat.format(score)}</span>{' '}
                    <span>LACES boosted</span>
                </p>
                {canBoost && !isChoosingAmount && (
                    <Button ref={boostButtonRef} type="button" variant="outline" size="sm" onClick={openForm}>
                        Boost
                    </Button>
                )}
            </div>

            {canBoost && isChoosingAmount && (
                <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                        <Label htmlFor={amountId}>LACES to spend</Label>
                        <Input
                            id={amountId}
                            autoFocus
                            type="number"
                            inputMode="numeric"
                            min={BOOST_MIN_AMOUNT}
                            max={BOOST_MAX_AMOUNT}
                            step={1}
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            aria-invalid={problem !== null}
                            aria-describedby={problem !== null ? problemId : undefined}
                            disabled={boost.isPending}
                            className="h-8 w-28"
                        />
                    </div>
                    <Button type="submit" size="sm" disabled={boost.isPending}>
                        {boost.isPending ? 'Boosting…' : 'Confirm boost'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={closeForm} disabled={boost.isPending}>
                        Cancel
                    </Button>
                </form>
            )}

            {problem && (
                <p id={problemId} role="alert" className="text-sm text-destructive">
                    {problem}
                </p>
            )}

            {boost.isSuccess && (
                <p role="status" className="text-sm text-muted-foreground">
                    Boosted with {numberFormat.format(boost.data.boost_amount)} LACES:{' '}
                    {numberFormat.format(boost.data.author_reward)} went to the author. You have{' '}
                    {numberFormat.format(boost.data.remaining_balance)} LACES left.
                </p>
            )}
        </div>
    );
};
