import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    const { address, chainId } = await request.json();

    if (!address || !chainId) {
        return NextResponse.json({ message: 'Invalid request Body', status: 400 });
    }

    const filePath = path.join(process.cwd(), 'src/utils/contract/_deployed', 'address.json');

    try {
        const originFile = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        fs.writeFileSync(
            filePath,
            JSON.stringify(
                {
                    Counter: {
                        ...originFile.Counter,
                        [chainId]: address,
                    },
                },
                null,
                4,
            ),
            'utf-8',
        );
        NextResponse.json({ message: 'File written successfully', status: 200 });
    } catch (error) {
        NextResponse.json({ message: 'Failed to write file', status: 500 });
    }
}
