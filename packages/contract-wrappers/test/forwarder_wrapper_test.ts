import { BlockchainLifecycle } from '@0xproject/dev-utils';
import { FillScenarios } from '@0xproject/fill-scenarios';
import { getContractAddresses } from '@0xproject/migrations';
import { assetDataUtils } from '@0xproject/order-utils';
import { SignedOrder } from '@0xproject/types';
import { BigNumber } from '@0xproject/utils';
import * as chai from 'chai';
import 'mocha';

import { ContractWrappers, OrderStatus } from '../src';

import { chaiSetup } from './utils/chai_setup';
import { constants } from './utils/constants';
import { tokenUtils } from './utils/token_utils';
import { provider, web3Wrapper } from './utils/web3_wrapper';

chaiSetup.configure();
const expect = chai.expect;
const blockchainLifecycle = new BlockchainLifecycle(web3Wrapper);

describe('ForwarderWrapper', () => {
    const fillableAmount = new BigNumber(5);
    let contractWrappers: ContractWrappers;
    let fillScenarios: FillScenarios;
    let exchangeContractAddress: string;
    let zrxTokenAddress: string;
    let userAddresses: string[];
    let coinbase: string;
    let makerAddress: string;
    let takerAddress: string;
    let feeRecipient: string;
    let anotherMakerAddress: string;
    let makerTokenAddress: string;
    let takerTokenAddress: string;
    let makerAssetData: string;
    let takerAssetData: string;
    let signedOrder: SignedOrder;
    let anotherSignedOrder: SignedOrder;
    before(async () => {
        await blockchainLifecycle.startAsync();
        const config = {
            networkId: constants.TESTRPC_NETWORK_ID,
            contractAddresses: getContractAddresses(),
            blockPollingIntervalMs: 10,
        };
        contractWrappers = new ContractWrappers(provider, config);
        exchangeContractAddress = contractWrappers.exchange.address;
        userAddresses = await web3Wrapper.getAvailableAddressesAsync();
        zrxTokenAddress = contractWrappers.exchange.zrxTokenAddress;
        fillScenarios = new FillScenarios(
            provider,
            userAddresses,
            zrxTokenAddress,
            exchangeContractAddress,
            contractWrappers.erc20Proxy.address,
            contractWrappers.erc721Proxy.address,
        );
        [coinbase, makerAddress, takerAddress, feeRecipient, anotherMakerAddress] = userAddresses;
        [makerTokenAddress] = tokenUtils.getDummyERC20TokenAddresses();
        takerTokenAddress = contractWrappers.forwarder.etherTokenAddress;
        [makerAssetData, takerAssetData] = [
            assetDataUtils.encodeERC20AssetData(makerTokenAddress),
            assetDataUtils.encodeERC20AssetData(takerTokenAddress),
        ];
        signedOrder = await fillScenarios.createFillableSignedOrderAsync(
            makerAssetData,
            takerAssetData,
            makerAddress,
            constants.NULL_ADDRESS,
            fillableAmount,
        );
        anotherSignedOrder = await fillScenarios.createFillableSignedOrderAsync(
            makerAssetData,
            takerAssetData,
            makerAddress,
            constants.NULL_ADDRESS,
            fillableAmount,
        );
    });
    after(async () => {
        await blockchainLifecycle.revertAsync();
    });
    beforeEach(async () => {
        await blockchainLifecycle.startAsync();
    });
    afterEach(async () => {
        await blockchainLifecycle.revertAsync();
    });
    describe('#marketBuyOrdersWithEthAsync', () => {
        it('should market buy orders with eth', async () => {
            const signedOrders = [signedOrder, anotherSignedOrder];
            const makerAssetFillAmount = signedOrder.makerAssetAmount.plus(anotherSignedOrder.makerAssetAmount);
            const txHash = await contractWrappers.forwarder.marketBuyOrdersWithEthAsync(
                signedOrders,
                makerAssetFillAmount,
                takerAddress,
                makerAssetFillAmount,
            );
            await web3Wrapper.awaitTransactionSuccessAsync(txHash, constants.AWAIT_TRANSACTION_MINED_MS);
            const ordersInfo = await contractWrappers.exchange.getOrdersInfoAsync([signedOrder, anotherSignedOrder]);
            expect(ordersInfo[0].orderStatus).to.be.equal(OrderStatus.FULLY_FILLED);
            expect(ordersInfo[1].orderStatus).to.be.equal(OrderStatus.FULLY_FILLED);
        });
    });
    describe('#marketSellOrdersWithEthAsync', () => {
        it('should market sell orders with eth', async () => {
            const signedOrders = [signedOrder, anotherSignedOrder];
            const makerAssetFillAmount = signedOrder.makerAssetAmount.plus(anotherSignedOrder.makerAssetAmount);
            const txHash = await contractWrappers.forwarder.marketSellOrdersWithEthAsync(
                signedOrders,
                takerAddress,
                makerAssetFillAmount,
            );
            await web3Wrapper.awaitTransactionSuccessAsync(txHash, constants.AWAIT_TRANSACTION_MINED_MS);
            const ordersInfo = await contractWrappers.exchange.getOrdersInfoAsync([signedOrder, anotherSignedOrder]);
            expect(ordersInfo[0].orderStatus).to.be.equal(OrderStatus.FULLY_FILLED);
            expect(ordersInfo[1].orderStatus).to.be.equal(OrderStatus.FILLABLE);
            expect(ordersInfo[1].orderTakerAssetFilledAmount).to.be.bignumber.equal(new BigNumber(4)); // only 95% of ETH is sold
        });
    });
});
