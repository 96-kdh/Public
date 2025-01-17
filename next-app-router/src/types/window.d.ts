import { ToastTypes } from '@/components/blocks/toasts/Toast';

export {};

declare global {
    interface Window {
        toast: (type: ToastTypes, msg: string) => void;
        ethereum: any;
    }
}
