process.env.PORT = 0;

const _ = require("lodash");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { ServiceBroker } = require("moleculer");

// Load service schemas
const APISchema = require("../../services/api.service");
const UsersSchema = require("../../services/user.service");
const OrganisationsSchema = require("../../services/organisations.service");
const TokensSchema = require("../../services/tokens.service");
const ProjectsSchema = require("../../services/projects.service");

describe("Test API Gateway endpoints", () => {
    let broker = new ServiceBroker({ logger: false });

    let usersService = broker.createService(UsersSchema);
    let orgService = broker.createService(OrganisationsSchema);
    let tokensService = broker.createService(TokensSchema);
    let projectsService = broker.createService(ProjectsSchema);
    let apiService = broker.createService(APISchema);

    // Test Data
    let userId2 = "";
    let userEntity = {};
    let userOrg = "";

    // Tests
    beforeAll(() => broker.start());
    afterAll(() => broker.stop());

    describe("Testing endpoitns in the 'user' service:", () => {
        // USER REGISTRATION/LOGIN
        it("POST '/api/user/first'", () => {
            return request(apiService.server)
                .post("/api/user/first")
                .send({
                    "user": {
                        "firstName":"Perica",
                        "lastName": "Perić",
                        "email":"pperic@gmail.com",
                        "settings":[],
                        "role": "admin",
                        "sex":"male",
                        "organisation": "",
                        "projects":[]
                    },
                    "org": {
                        "name":"Firmic855aaa",
                        "address":"Adresa",
                        "city":"Grad",
                        "country":"Država",
                        "members":[],
                        "projects":[]
                    }
                })
                .then(res => {
                    expect(res.statusCode).toBe(200);

                    userId = res.body.user._id;
                    userToken = res.body.user.token;
                    userOrg = res.body.user.organisation._id;
                });
        });

        it("POST '/api/user'", () => {
            return request(apiService.server)
                .post("/api/user/create")
                .send({
                    "user": {
                        "firstName":"Perica",
                        "lastName": "Horvat",
                        "email":"ph@gmail.com",
                        "settings":[],
                        "role": "employee",
                        "sex":"male",
                        "organisation": "Y45l0HzV4UDoHgOf",
                        "projects":[]
                    }
                })
                .then(res => {
                    expect(res.statusCode).toBe(200);
                    expect(typeof res.body.user._id).toBe("string");
                    expect(res.body.user.email).toEqual("ph@gmail.com");
                    expect(res.body.user.firstName).toEqual("Perica");
                    expect(res.body.user.lastName).toEqual("Horvat");
                    expect(typeof res.body.user.token).toBe("string");
                });
        });

        it("POST '/api/user/login'", () => {
            return request(apiService.server)
                .post("/api/user/login")
                .send({
                    "user": {
                        "email": "ph@gmail.com",
                        "password": "123456"
                    }
                })
                .then(async res => {
                    expect(res.statusCode).toBe(200);
                    userEntity = res.body;
                    userId2 = res.body.user._id;
                    userToken = res.body.user.token;
                });
        });

        // USER EVENTS
        describe("Testing 'user.orgAdded' event:", () => {
            it("Should call event handler", async () => {
                usersService.adapter.updateById = jest.fn();

                await usersService.emitLocalEventHandler("user.orgAdded", {
                    user: userId2,
                    id: userOrg
                });

                expect(usersService.adapter.updateById).toBeCalledTimes(1);
                usersService.adapter.updateById.mockRestore();
            });
        });

        describe("Testing 'project.created' event:", () => {
            it("Should call event handler", async () => {
                usersService.adapter.updateById = jest.fn();

                await usersService.emitLocalEventHandler("project.created", {
                    user: userId2,
                    project: {
                        color: "#fff",
                        name: "Projekt",
                        organisation: "123456",
                        budget: 100,
                        members: [],
                        tasks: []
                    }
                });

                expect(usersService.adapter.updateById).toBeCalledTimes(1);
                usersService.adapter.updateById.mockRestore();
            });
        });

        describe("Testing 'project.removed' event:", () => {
            it("Should call event handler", async () => {
                usersService.adapter.find = jest.fn();

                await usersService.emitLocalEventHandler("project.removed", {
                    project: "123456"
                });

                expect(usersService.adapter.find).toBeCalledTimes(1);
                usersService.adapter.find.mockRestore();
            });
        });

        describe("Testing 'organisation.removed' event:", () => {
            it("Should call event handler", async () => {
                usersService.adapter.find = jest.fn();

                await usersService.emitLocalEventHandler("organisation.removed", {
                    org: "Y45l0HzV4UDoHgOf"
                });

                expect(usersService.adapter.find).toBeCalledTimes(1);
                usersService.adapter.find.mockRestore();
            });
        });

        // USER METHODS
        describe("Testing 'generateJWT' method:", () => {
            it("Should return JSON Web Token", async () => {
                jwt.sign = jest.fn();
                usersService.generateJWT(userEntity);
                expect(jwt.sign).toBeCalledTimes(1);
                jwt.sign.mockRestore();
            });
        });

        describe("Testing 'transformEntity' method:", () => {
            it("Should return user entity as object", async () => {
                const result = usersService.transformEntity(userEntity, false, "");
                expect(result.user.user.firstName).toEqual("Perica");
                expect(result.user.user.lastName).toEqual("Horvat");
            });
        });

        describe("Testing 'checkIsAuthorized' method:", () => {
            it("Should return flag if user is authorized to use action", async () => {
                const result = await usersService.checkIsAuthorized(userEntity.user._id, "employee");
                expect(result).toBe(true);
            });
        });
    });
});
