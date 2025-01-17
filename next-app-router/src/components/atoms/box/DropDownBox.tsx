import React, { useEffect, useState } from 'react';
import { css, styled } from 'styled-components';

import { ToastTypes } from '@/components/blocks/toasts/Toast';

const getToastDefaultCSS = (type?: ToastTypes) => {
    switch (type) {
        case 'error':
            return css`
                background-color: #dc3545;
                color: #fff;
            `;
        case 'success':
            return css`
                background-color: #198754;
                color: #fff;
            `;
        case 'warning':
            return css`
                background-color: #ffc107;
                color: #212529;
            `;
        case 'noti':
        default:
            return css`
                background-color: #6c757d;
                color: #fff;
            `;
    }
};

interface StyledButtonProps {
    $toastType?: ToastTypes;
}

const Container = styled.div<StyledButtonProps>`
    z-index: 999 !important;
    ${(props) => getToastDefaultCSS(props.$toastType)};

    min-width: 210px;
    height: 50px;
    padding: 0 12px;
    backdrop-filter: blur(30px);
    border-radius: 6px;
    text-align: center;
    align-content: center;
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translate(-50%);
    animation: fadeDownCenter 0.5s;

    @keyframes fadeDownCenter {
        0% {
            opacity: 0;
            transform: translateY(-100%) translateX(-50%);
        }
        to {
            opacity: 1;
            transform: translateY(0) translateX(-50%);
        }
    }

    .children {
        z-index: 999 !important;
        position: relative;
    }
`;

interface IProps extends StyledButtonProps {
    children?: React.ReactNode;
}

const DropDownBox = ({ children, $toastType, ...props }: IProps) => {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false);
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    return (
        visible && (
            <Container $toastType={$toastType} {...props}>
                <div className="children">{children}</div>
            </Container>
        )
    );
};

export default DropDownBox;
