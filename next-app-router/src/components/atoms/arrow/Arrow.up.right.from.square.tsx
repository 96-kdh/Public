import React from 'react';
import { styled } from 'styled-components';

interface ContainerProps {
    width: string;
    height: string;
    color: string;
}

const Container = styled.div<ContainerProps>`
    position: relative;
    margin-left: 4px;
    margin-right: 4px;
    width: ${(props) => props.width};
    height: ${(props) => props.height};

    &::before {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        content: '';
        width: ${(props) => props.width};
        height: ${(props) => props.height};
        background-color: ${(props) => props.color};
        mask-repeat: no-repeat;
        mask-position: center;
        mask-image: url('/images/common/arrow/arrowUpRightFromSquare.svg');
    }
`;

const ArrowUpRightFromSquare = ({ width, height, color }: ContainerProps) => {
    return <Container width={width} height={height} color={color} />;
};

export default ArrowUpRightFromSquare;
