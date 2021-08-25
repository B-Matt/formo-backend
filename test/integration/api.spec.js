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
    let userId = "";
    let userId2 = "";
    let userEntity = {};
    let userToken = "";
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

        it("POST '/api/user' - Same email exception", () => {
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
                        "organisation": "",
                        "projects":[]
                    }
                })
                .then(res => {
                    expect(res.statusCode).toBe(422);
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

        // FORGOT
        it("POST '/forgot-password' - Mail not registered exception", () => {
            return request(apiService.server)
                .delete('/api/forgot-password')
                .send({
                    'email': 'ph123@gmail.com'
                })
                .then(res => {
                    expect(res.statusCode).toBe(404);
                });
        });

        it("POST '/forgot-password'", () => {
            return request(apiService.server)
                .delete('/api/user/forgotPassword')
                .send({
                    'email': 'ph@gmail.com'
                })
                .then(res => {
                    expect(res.statusCode).toBe(200);
                });
        });

        // USER GET
        it("GET '/api/user/'", () => {
            return request(apiService.server)
                .get("/api/user/list")
                .then(res => {
                    expect(res.statusCode).toBe(200);
                });
        });

        it("GET '/api/user/:id'", () => {
            return request(apiService.server)
                .get('/api/user/get/')
                .send({
                    'id': userId,
                    'getOrg': true
                })
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(200);
                });
        });

        it("GET '/api/user/' - Unauthorized exception", () => {
            return request(apiService.server)
                .get('/api/user/get/')
                .send({
                    'id': userId,
                    'getOrg': false
                })
                .then(res => {
                    expect(res.statusCode).toBe(401);
                });
        });

        it("GET '/api/user/' - User not found exception", () => {
            return request(apiService.server)
                .get('/api/user/get/')
                .send({
                    'id': '12356',
                    'getOrg': false
                })
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(404);
                });
        });

        it("GET '/api/user/small/'", () => {
            return request(apiService.server)
                .get('/api/user/getBasicData')
                .send({
                    'id': userId
                })
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {

                    expect(res.statusCode).toBe(200);
                    expect(res.body.firstName).toEqual("Perica");
                    expect(res.body.lastName).toEqual("Perić");
                });
        });

        it("GET '/api/user/small/' - Unauthorized exception", () => {
            return request(apiService.server)
                .get('/api/user/getBasicData')
                .send({
                    'id': userId
                })
                .then(res => {
                    expect(res.statusCode).toBe(401);
                });
        });

        it("GET '/api/user/small/' - User not found exception", () => {
            return request(apiService.server)
                .get('/api/user/getBasicData')
                .send({
                    'id': '123456'
                })
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(404);
                });
        });

        it("GET '/api/user/org/'", () => {
            return request(apiService.server)
                .get('/api/user/getbyOrg')
                .send({
                    'org': userOrg
                })
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(200);
                });
        });

        it("GET '/api/user/org/' - Unauthorized exception", () => {
            return request(apiService.server)
                .get('/api/user/getbyOrg')
                .send({
                    'id': userId
                })
                .then(res => {
                    expect(res.statusCode).toBe(401);
                });
        });

        it("Should return user from given JWT.", async () => {
            const res = await broker.call("user.resolveToken", { token: userToken });
            expect(res.firstName).toEqual('Perica');
            expect(res.lastName).toEqual('Horvat');
            expect(res.email).toEqual('ph@gmail.com');
        });

        it("GET /user/check/:id'", () => {
            return request(apiService.server)
                .delete('/api/user/isCreated')
                .send({
                    'id': userId2
                })
                .then(res => {
                    expect(res.statusCode).toBe(200);
                    expect(res.body.firstName).toEqual('Perica');
                    expect(res.body.lastName).toEqual('Horvat');
                });
        });

        it("GET /user/authorized/:id'", () => {
            return request(apiService.server)
                .delete('/api/user/isAuthorized')
                .send({
                    'actionRank': 'project_manager'
                })
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(200);
                });
        });

        it("GET /user/authorized/:id' - Unauthorized exception", () => {
            return request(apiService.server)
                .delete('/api/user/isAuthorized')
                .send({
                    'actionRank': 'project_manager'
                })
                .then(res => {
                    expect(res.statusCode).toBe(401);
                });
        });

        // USER EDIT
        it("PATCH '/api/user/'", () => {
            const editEntity = _.cloneDeep(userEntity);
            editEntity.user.firstName = "Đuro";
            editEntity.user.password = "123456";
            editEntity.user.organisation = [];

            return request(apiService.server)
                .patch('/api/user/update')
                .send(editEntity)
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(200);
                    expect(res.body.user.firstName).toEqual("Đuro");
                });
        });

        it("PATCH '/api/user/' - User already has same e-mail exception", () => {
            const editEntity = _.cloneDeep(userEntity);
            editEntity.user.firstName = "Đuro";
            editEntity.user.password = "123456";
            editEntity.user.email = "pperic@gmail.com";
            editEntity.user.organisation = [];

            return request(apiService.server)
                .patch('/api/user/update')
                .send(editEntity)
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(422);
                });
        });

        it("PATCH '/api/user/' - Invalid role exception", () => {
            const editEntity = _.cloneDeep(userEntity);
            editEntity.user.password = "123456";
            editEntity.user.role = "testing";
            editEntity.user.organisation = [];

            return request(apiService.server)
                .patch('/api/user/update')
                .send(editEntity)
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(400);
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

        // USER DELETION
        it("DELETE '/api/user/' - Not allowed exception", () => {
            return request(apiService.server)
                .delete('/api/user/remove')
                .send({
                    'id': userId
                })
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(405);
                });
        });

        it("DELETE '/api/user/' - Unauthorized exception", () => {
            return request(apiService.server)
                .delete('/api/user/remove')
                .send({
                    'id': userId2
                })
                .then(res => {
                    expect(res.statusCode).toBe(401);
                });
        });

        it("DELETE '/api/user/'", () => {
            return request(apiService.server)
                .delete('/api/user/remove')
                .send({
                    'id': userId2
                })
                .set('Authorization', `Bearer ${userToken}`)
                .then(res => {
                    expect(res.statusCode).toBe(200);
                });
        });

        it("test '/api/unknown-route'", () => {
            return request(apiService.server)
                .get("/api/unknown-route")
                .then(res => {
                    expect(res.statusCode).toBe(404);
                });
        });
    });
});