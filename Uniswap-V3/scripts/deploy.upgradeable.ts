import hre from 'hardhat';

async function main() {
    const contractFactory = await hre.ethers.getContractFactory('TestUpgradeable');
    const contract = await hre.upgrades.deployProxy(contractFactory, ['upgrade'], {
        initializer: 'initialize(string)',
    });

    console.log('deploying contract ... ');

    await contract.deployed();
    const addr = contract.address;

    console.log('CA:', addr);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
