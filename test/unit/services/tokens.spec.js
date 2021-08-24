"use strict";

const { ServiceBroker, Context } = require("moleculer");
const { ValidationError } = require("moleculer").Errors;

const TokensService = require("../../../services/tokens.service");
const C = require("../../../constants");

const TOKEN_EXPIRATION = 60 * 60 * 1000; // 1 hour

describe("Test 'tokens' service", () => {
    let broker = new ServiceBroker({ logger: false });
    let service = broker.createService(TokensService);

    // Mockings
    let tokens = [];
    const mockInsert = jest.fn(params => {
        tokens.push(params);
    });

    const mockFindEntity = jest.fn(ctx => {
        let token = null;
        tokens.forEach(t => {
            if(t.token == ctx.params.token) {
                token = t;
            }
        });
        return token;
    });

    const mockRemoveEntity = jest.fn(ctx => {
        tokens = tokens.filter(t => t.token != ctx.token);
    });

    const mockRemoveMany = jest.fn(ctx => {
        const len = tokens.length;
        tokens = [];
        return len;
    });

    // Tests
    beforeAll(() => broker.start());
    afterAll(() => broker.stop());

    describe("Testing 'tokens.generate' action:", () => {
        it("Should return verification token.",  async () => {
            const res = await broker.call("tokens.generate", { 
                type: C.TOKEN_TYPE_VERIFICATION, 
                owner: '1',
                expiry: TOKEN_EXPIRATION
            });

            expect(typeof res._id).toBe("string");
            expect(res.type).toEqual(C.TOKEN_TYPE_VERIFICATION);
            expect(res.expiry).toEqual(TOKEN_EXPIRATION);
            expect(res.owner).toEqual('1');
            expect(typeof res.token).toBe("string");
        });

        it("Should return validation error on generation of new token.", async () => {
            expect.assertions(1);
            try {
                await broker.call("tokens.generate", { 
                    type: C.TOKEN_TYPE_VERIFICATION, 
                    owner: '1',
                    expiry: 'ada'
                });
            } catch (err) {
                expect(err).toBeInstanceOf(ValidationError);
            }
        });
    });

    describe("Testing 'tokens.check' action:", () => {
        it("Should return if token exist and not expired.", async () => {
            service.adapter.insert = mockInsert;
            service.findEntity = mockFindEntity;

            const tokenData = await broker.call("tokens.generate", { 
                type: C.TOKEN_TYPE_VERIFICATION, 
                owner: '1',
                expiry: TOKEN_EXPIRATION
            });
            const checkData = await broker.call("tokens.check", { 
                type: C.TOKEN_TYPE_VERIFICATION, 
                owner: '1',
                token: service.secureToken(tokenData.token)
            });

            expect(mockInsert).toBeCalledTimes(1);
            expect(mockFindEntity).toBeCalledTimes(1);
            expect(checkData).toEqual(false);
        });

        it("Should return validation error when checking token.", async () => {
            service.adapter.insert = mockInsert;
            service.findEntity = mockFindEntity;

            expect.assertions(1);
            try {
                await broker.call("tokens.check", { 
                    type: C.TOKEN_TYPE_VERIFICATION, 
                    owner: '1'
                });
            } catch (err) {
                expect(err).toBeInstanceOf(ValidationError);
            }
        });
    });

    describe("Testing 'tokens.remove' action:", () => {
        it("Should remove token from token array.", async () => {
            service.adapter.insert = mockInsert;
            service.findEntity = mockFindEntity;
            service.removeEntity = mockRemoveEntity;

            const tokenData = await broker.call("tokens.generate", { 
                type: C.TOKEN_TYPE_VERIFICATION, 
                owner: '1',
                expiry: TOKEN_EXPIRATION
            });
            const checkData = await broker.call("tokens.removeToken", { 
                type: C.TOKEN_TYPE_VERIFICATION, 
                token: service.secureToken(tokenData.token)
            });

            expect(mockInsert).toBeCalledTimes(2);
            expect(mockFindEntity).toBeCalledTimes(2);
            expect(mockRemoveEntity).toBeCalledTimes(1);
            expect(checkData).toEqual(true);
        });

        it("Should return validation error when removing token.", async () => {
            service.adapter.insert = mockInsert;
            service.findEntity = mockFindEntity;
            service.removeEntity = mockRemoveEntity;

            expect.assertions(1);
            try {
                await broker.call("tokens.remove", { 
                    type: C.TOKEN_TYPE_VERIFICATION, 
                    token: 1
                });
            } catch (err) {
                expect(err).toBeInstanceOf(ValidationError);
            }
        });
    });

    describe("Testing 'tokens.clearExpired' action:", () => {
        it("Should clear all tokens from token array.", async () => {
            service.adapter.insert = mockInsert;
            service.adapter.removeMany = mockRemoveMany;

            await broker.call("tokens.generate", { 
                type: C.TOKEN_TYPE_VERIFICATION, 
                owner: '1',
                expiry: -100
            });

            await broker.call("tokens.generate", { 
                type: C.TOKEN_TYPE_VERIFICATION, 
                owner: '1',
                expiry: -100
            });
            const data = await broker.call("tokens.clearExpired");

            expect(mockInsert).toBeCalledTimes(4);
            expect(mockRemoveMany).toBeCalledTimes(1);
            expect(data).toBeGreaterThan(0);
        });

        it("Should return validation error when clearing tokens.", async () => {
            service.adapter.removeMany = mockRemoveMany;

            try {
                await broker.call("tokens.clearExpired", { 
                    type: C.TOKEN_TYPE_VERIFICATION, 
                    owner: '1'
                });
            } catch (err) {
                expect(err).toBeInstanceOf(ValidationError);
            }
        });
    });
});