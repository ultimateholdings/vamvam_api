# Vamvam Admin API documentation

All actions here can only be made if the user has valid credentials

The valid credentials should be provided to through headers in the query and must have the entry `"authorization": "Bearer [the access token]"`

The actions are splitted per administratror role and the available roles are

| Role   | duties    |
| --------------- | --------------- |
| Registration manager   | Manage every actions related to driver registration    |
| Conflict manager   | Manage every actions related to delivery conflicts   |
| Admin manager   | manage every actions related to administratrors management, platform settings and some special actions which the other admins cannot perform (There's only one of this kind in the platform)  |

## Data Model

<details id="enumerations">
<summary> Enumerations </summary>

| Property   | values    |
| --------------- | --------------- |
| adminType   | `conflict`, `registration`   |
| deliveryStatuses | `archived`, `cancelled`, `conflicting`, `ongoing`, `terminated` |

</details>

<details id="registrationdata">
<summary> registrationData </summary>

| Property | dataType | Optional | role |
| -------: | -------- | -------- | ---- |
| gender | [genderData](#enumerations) | True | driver's gender |
| lang | [languageData](#enumerations) | True | driver's preferred language |
| sponsorCode | `String` | True | code eventually given to the drive during registration |
| age | [ageData](#enumerations) | False | driver's age range |
| carInfos | File | False | a file containing all driver's car informations |
| email | `String` | False | driver's email |
| firstName | `String` | False | driver's firstname |
| lastName | `String` | False | driver's lastName |
| password | `String` | False | driver's initial password in the platform |
| phoneNumber | `String` | False | driver's phone number |
</details>

<details id="sponsordata">
<summary> sponsorData </summary>


| Property | dataType | role |
| -------- | -------- | ---- |
| sponsor | <table> <thead><tr> <th> Property </th> <th> dataType </th></tr></thead> <tbody> <tr> <td> id </td> <td> `String` </td></tr> <tr> <td> code </td> <td> `String` </td></tr> <tr> <td> name </td> <td> `String` </td></tr> <tr> <td> phone </td> <td> `String` </td></tr> </tbody></table> | informations about a sponsor |
| sponsored | `Number` | number of users registered by this sponsor |

</details>

<details id="conflictdata">
<summary> conflictData </summary>

This object holds informations about a raised conflict

> Note: only the `cancelationDate` property is optional for this model

| Property | dataType | role |
| ------- | -------- | ---- |
| cancelationDate | `Date` | cancelation date of the delivery |
| lastLocation | [locationData](#locationdata) | location of the driver while reporting the conflict |
| delivery | [deliveryData](#deliverydata) | informations about the conflicting delivery |
| date | `Date` | date when the conflict was reported |
| id | `String` | the conflict indentifier |
| status | `String` | the status of the conflict |
| type | `String` | the type of conflict |
| reporter | [UserData](#userdata) | informations about the conflict's reporter |

</details>

<details id="conflicttype">
<summary> conflictTypeData </summary>

| Property | dataType | role |
| -------: | -------- | ---- |
| code | `String` | conflict's code in the platform |
| en | `String` | conflict name in english |
| fr | `String` | conflict name in french |

</details>

<details id="settings">
<summary> SettingsData </summary>

A SettingsData is an object having two properties `type` and `value` representing respectively the type and the value of a setting.

The `type` property is always a **string** and the `value` is always and **Object** and the available settings are:

#### OTPSettingsData

- type: "otp"
- value: an object having the schema `{ ttl: number }` with ttl the time-to-leave of the OTP authentication

#### DeliverySettingsData
- type: "delivery"
- value: an object described bellow

| Property | dataType | role |
| -------: | -------- | ---- |
| search_radius | `Number` | the radius to search a driver in second |
| ttl | `Number` | the delay within which a driver can accept a delivery |
| conflict_types | [conflictTypeData](#conflicttype)[] | the type of conflicts supported by the platform |
| package_types | [conflictTypeData](#conflicttype)[] | the type of packages supported by the platform |

</details>



## Conflict manager actions

#### Gather the drivers close to a location

> Note: keep in mind that this action is also available for the Admin manager

**Endpoint**    `/users/drivers`

**Request Type**    `GET`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| from    | [locationData](./README.md#locationdata)    | The coordinates of the location to make the search    |
| by    | `Number`    | the search's radius    |
| internal   | `Boolean`   | A flag to tell if we should only look for internal drivers   |

**Response**    [userData](./README.md#userdata)[]

#### Assign an internal driver to a conflicting delivery

**Endpoint**    `/delivery/conflict/assign-driver`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| id    | `String`    | the conflict's identifier    |
| driverId    | `String`    | the driver's identifier    |

#### Archive a conflicting delivery

**Endpoint**    `/delivery/conflict/archive`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| id    | `String`    | the conflict's identifier    |



## Registration manager actions

#### Create an internal driver

**Endpoint**    `/driver/register-intern`

**Request Type**    `POST`

**Body Params** [registrationData](#registrationdata)

**Response**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| id    | `String`    | the identifier of the newly added driver    |

#### Update a driver registration

**Endpoint**    `/driver/update-registration`

**Request Type**    `POST`

**Body Params** [registrationData](#registrationdata) (only the properties provided are considered so the are all optional)

#### handle a registration demand

**Endpoint**    `/driver/handle-registration`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| id    | `String`    | the registration's identifier (should be unhandled otherwise will respond with error)   |

#### reject a registration demand

**Endpoint**    `/driver/reject-registration`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| id    | `String`    | the registration's identifier (should be unhandled otherwise will respond with error)   |

#### Gather new driver registrations

**Endpoint**    `/driver/registrations`

**Request Type**    `GET`

**Query Params**

| Property    | dataType    | role    | optional |
|---------------- | --------------- | --------------- | ------- |
| name    | `String`    | the driver's fullname to match | True |
| maxPageSize    | `Number`    | the maximum number of item needed for the request    | if not provided will default to 10 |
| skip    | `Number`    | the number of item to skip from all the available items    | True |

**Headers**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| page-token    | `String`    | the token to indicate the number of items already read (if not provided or if expired it will fallback to the first items)   |

**Response**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| results    | [registrationData](#registrationdata)[]    | the items (in this case registrations) gathered    |
| nextPageToken    | `String`    | the token to provide for the next request (used for pagination purpose)    |
| refreshed | `Boolean` | flag to tell if a pagination request has been refreshed(this can be due to either a token invalidated or an update occured) |

#### Gather registrations you've settled

**Endpoint**    `/driver/all-settled`

**Request Type**    `GET`

**Query Params**

| Property    | dataType    | role    | optional |
|---------------- | --------------- | --------------- | ------- |
| maxPageSize    | `Number`    | the maximum number of item needed for the request    | if not provided will default to 10 |
| skip    | `Number`    | the number of item to skip from all the available items    | True |
| from    | `String` (a date string in the `YYYY-MM-DD` format)    | the date after which the (validation or rejection) has been done   | True |
| to    | `String` (a date string in the `YYYY-MM-DD` format)   | the date before which the (validation or rejection) has been done | True |
| name    | `String`    | the driver's full name to match    | True |
| status    | `String`    | the registration status to match (`validated` or `pending`)   | if not provided will default to `pending` |

**Headers**     Same as [Gather new driver registrations](#gather-new-driver-registrations)

**Response**    Same as [Gather new driver registrations](#gather-new-driver-registrations)


## Admin manager actions

#### Block a user account

**Endpoint**    `/admin/block-user`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| id    | `String`    | user's identifier    |

#### Activate a user account

**Endpoint**    `/admin/activate-user`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| id    | `String`    | user's identifier    |

#### Block all user tokens

**Endpoint**    `/admin/revoke-all`

**Request Type**    `POST`

#### Create a new administrator

**Endpoint**    `/admin/new-admin`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| phoneNumber    | `String`    | the new administrator's phone number    |
| password    | `String`    | the new administrator's password    |
| email   | `String`   | the new administratror's email   |
| type   | [adminType](#enumerations)   | the type of admin to create   |

#### Update system settings

**Endpoint**    `/admin/update-settings`

**Request Type**    `POST`

**Body Params**     [SettingsData](#settings)

#### Gather all users in the platform

**Endpoint**    `/user/all`

**Request Type**    `GET`

**Query Params**

| Property    | dataType    | role    | optional |
|---------------- | --------------- | --------------- | ------- |
| maxPageSize    | `Number`    | the maximum number of item needed for the request    | if not provided will default to 10 |
| skip    | `Number`    | the number of item to skip from all the available items    | True |
| role    | `String`     | the role of the user to match  | True |

**Headers**     Same as [Gather new driver registrations](#gather-new-driver-registrations)

**Response**    Same as [Gather new driver registrations](#gather-new-driver-registrations) in this case each item is a [userData](#./README.md#userdata)

#### Gather all deliveries in the platform

**Endpoint**    `/delivery/all`

**Request Type**    `GET`

**Query Params**

| Property    | dataType    | role    | optional |
|---------------- | --------------- | --------------- | ------- |
| maxPageSize    | `Number`    | the maximum number of item needed for the request    | if not provided will default to 10 |
| skip    | `Number`    | the number of item to skip from all the available items    | True |
| from    | `String` (a date string in the `YYYY-MM-DD` format)    | the date after which the matching delivery has been requested   | True |
| to    | `String` (a date string in the `YYYY-MM-DD` format)   | the date before which the matching delivery has been requested | True |
| status    | `String`    | the delivery status to match [deliveryStatuses](#enumerations)   | True |

**Headers**     Same as [Gather new driver registrations](#gather-new-driver-registrations)

**Response**    Same as [Gather new driver registrations](#gather-new-driver-registrations)

#### Gather the deliveries count per status within a period

**Endpoint**    `/delivery/analytics`

**Request Type**    `GET`

**Query Params**

| Property    | dataType    | role    | optional |
|---------------- | --------------- | --------------- | ------- |
| from    | `String` (a date string in the `YYYY-MM-DD` format)    | the date after which the delivery has been initiated   | True |
| to    | `String` (a date string in the `YYYY-MM-DD` format)   | the date before which the delivery has been initiated | True |

**Headers**     Same as [Gather new driver registrations](#gather-new-driver-registrations)

**Response**

The response Object only has one property **results** which is an object described by the following table:

| Property   | dataType    |
|--------------- | --------------- |
| archived   | `Number`   |
| cancelled   | `Number`   |
| conflicting   | `Number`   |
| ongoing   | `Number`   |
| terminated   | `Number`   |
| total   | `Number`   |

#### Create a new sponsor

**Endpoint**    `/sponsor/create`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| code    | `String`    | the sponsoring code    |
| phone    | `String`    | the sponsor phone number    |
| name   | `String`   | the sponsor name   |

#### Gather the sponsors sorted by number of mentored users

**Endpoint**    `/sponsor/ranking`

**Request Type**    `GET`

**Query Params**

| Property    | dataType    | role    | optional |
|---------------- | --------------- | --------------- | ------- |
| maxPageSize    | `Number`    | the maximum number of item needed for the request    | if not provided will default to 10 |
| skip    | `Number`    | the number of item to skip from all the available items    | True |

**Headers**     Same as [Gather new driver registrations](#gather-new-driver-registrations)

**Response**    Same as [Gather new driver registrations](#gather-new-driver-registrations) here each item is a [sponsorData](#sponsordata)

#### Gather users mentored by a sponsor

**Endpoint**    `/sponsor/enrolled`

**Request Type**    `GET`

**Query Params**

| Property    | dataType    | role    | optional |
|---------------- | --------------- | --------------- | ------- |
| maxPageSize    | `Number`    | the maximum number of item needed for the request    | if not provided will default to 10 |
| skip    | `Number`    | the number of item to skip from all the available items    | True |
| id    | `String`    | sponsor's identifier   | False |

**Headers**     Same as [Gather new driver registrations](#gather-new-driver-registrations)

**Response**    Same as [Gather new driver registrations](#gather-new-driver-registrations) here each item is a [shortUserData](./README.md#userdata-short)

#### Create a new subscription bundle

**Endpoint**    `/bundle/new-bundle`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| bonus    | `Number`    | the bonuses provided by this subscription    |
| point    | `Number`    | the points provided by this subscription    |
| unitPrice   | `Number`   | the cost of a point   |

#### Update a subscription bundle

**Endpoint**    `/bundle/update`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | optional    |
|---------------- | --------------- | --------------- |
| id    | `String`    | False    |
| bonus    | `Number`    | True    |
| point   | `Number`   | True   |
| unitPrice   | `Number`   | True   |

#### Delete a subscription bundle

**Endpoint**    `/bundle/delete`

**Request Type**    `POST`

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| id    | `String`    | the bundle's identifier    |


#### Gather payments within a given period

> Note: Here the pagination is delegated to the user so there may have some data inaccuracies in case of addition of some transactions
**apologies for that**. It will be fixed in a near future

**Endpoint**   `/transaction/history`

**Request Type**    `GET`

**Query Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| page    | `Number`    | the page we wish to gather assuming we every page should have at most `limit` items    |
| limit    | `Number`    | the number of items to have per page    |

**Body Params**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| type    | `String`    | the type of transaction to show    |
| startDate    | `String` (a date string in the `YYYY-DD-MM` format)    | the begining date of the period |
| endDate    | `String` (a date string in the `YYYY-DD-MM` format)    | the ending date of the period |

**Response**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| amount    | `Number`    | the amount added in the user's main sum   |
| bonus    | `Number`    | the amount added in the user's bonus sum   |
| point   | `Number`   | the point added to the user's account   |
| date   | `String` (a date string in the `YYYY-DD-MM` format)   | the transaction's date   |
| avatar   | `String`   | link to the avatar of the user who initiated the transaction   |
| firstName   | `String`   | firstName of the user who initiated the transaction   |
| lastName   | `String`   | lastName of the user who initiated the transaction   |

#### Gather global payments informations

**Endpoint**    `/transaction/recharge-infos`

**Request Type**    `GET`

**Response**

| Property    | dataType    | role    |
|---------------- | --------------- | --------------- |
| solde    | `Number`    | the balance between widthdrawals and payments |
| bonus    | `Number`    | the balance between bonuses used and gain generated all payments |
| point   | `Number`   | the balance between points used and paid |
