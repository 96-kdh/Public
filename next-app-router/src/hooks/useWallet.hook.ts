import { useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';

import PublicNode from '@/app/api/node';
import { setRpc } from '@/ducks/slice/wallet.slice';
import { useDispatch } from 'react-redux';

/**
 * [Text content does not match server-rendered HTML] error,
 * Solution 1: Using useEffect to run on the client only
 * ref: https://nextjs.org/docs/messages/react-hydration-error
 */
const UseWalletHook = () => {
    const dispatch = useDispatch();

    const { address: connectedAddress, isDisconnected } = useAccount();
    const connectedChainId = useChainId();

    const [address, setAddress] = useState<`0x${string}` | undefined>(undefined);

    useEffect(() => {
        if (isDisconnected) {
            setAddress(undefined);
            return;
        }

        if (connectedAddress) setAddress(connectedAddress);
    }, [connectedAddress, isDisconnected]);

    useEffect(() => {
        if (PublicNode.chainId !== connectedChainId) {
            console.log('dif chainId, change public node chainId');
            const url = PublicNode.changeChainId(connectedChainId);
            dispatch(setRpc({ url, chainId: connectedChainId }));
        }
    }, [connectedChainId, PublicNode.chainId]);

    return { address };
};

export default UseWalletHook;
