const _ = require('lodash/fp')
const express = require('express')
const cors = require('cors')
const uuid = require('uuid/v4')
const { google } = require('googleapis')
const { Firestore } = require('@google-cloud/firestore')
const bodyParser = require('body-parser')
const Joi = require('@hapi/joi')
const { promiseHandler, Response, validateInput } = require('./utils')


const main = async () => {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  })
  const authClient = await auth.getClient()
  const iam = google.iam({ version: 'v1', auth: authClient })
  const iamcredentials = google.iamcredentials({ version: 'v1', auth: authClient })

  const firestore = new Firestore()

  const app = express()
  app.use(bodyParser.json())
  app.use(cors())
  app.use('/docs', express.static('docs'))

  const emailSchema = Joi.string().email()

  const projectId = 'terra-test-users-1'

  const deleteUser = async email => {
    try {
      await iam.projects.serviceAccounts.delete({
        name: `projects/${projectId}/serviceAccounts/${email}`
      })
    } catch (error) {
      // If it doesn't exist, silently succeed
      if (error.code !== 404) {
        throw error
      }
    }
    await firestore.doc(`users/${email}`).delete()
  }

  const withAuth = wrappedFn => async (req, ...args) => {
    const idToken = (req.headers.authorization || '').split(' ')[1]
    const ticket = await authClient.verifyIdToken({ idToken, audience: 'https://terra-lyle.appspot.com' })
    const { email } = ticket.getPayload()
    if (email !== 'lyle-user@terra-lyle.iam.gserviceaccount.com') {
      throw new Response(403)
    }
    return wrappedFn(req, ...args)
  }

  /**
   * @api {get} /status System status
   * @apiName status
   * @apiVersion 1.0.0
   * @apiGroup System
   * @apiSuccess (Success 200) -
   */
  app.get('/status', promiseHandler(async () => {
    return new Response(200)
  }))

  /**
   * @api {post} /api/create Create service account
   * @apiName create
   * @apiVersion 1.0.0
   * @apiGroup Service accounts
   * @apiSuccess (Success 200) {String} email Service account email
   */
  app.post('/api/create', promiseHandler(withAuth(async () => {
    // Slicing to stay within 30-character length limit
    const accountId = `user-${uuid().slice(0, 23)}`
    const email = `${accountId}@${projectId}.iam.gserviceaccount.com`
    await firestore.doc(`users/${email}`).create({ renewedAt: new Date() })
    await iam.projects.serviceAccounts.create({
      name: `projects/${projectId}`,
      requestBody: { accountId }
    })
    return new Response(200, { email })
  })))

  /**
   * @api {post} /api/delete Delete service account
   * @apiName delete
   * @apiVersion 1.0.0
   * @apiGroup Service accounts
   * @apiParam {String} email Service account email
   * @apiSuccess (Success 200) -
   */
  app.post('/api/delete', promiseHandler(withAuth(async req => {
    validateInput(req.body, Joi.object().keys({ email: emailSchema }))
    const { email } = req.body
    await deleteUser(email)
    return new Response(200, {})
  })))

  /**
   * @api {post} /api/renew Renew service account
   * @apiDescription Resets the automatic cleanup timer on the specified service account
   * @apiName renew
   * @apiVersion 1.0.0
   * @apiGroup Service accounts
   * @apiParam {String} email Service account email
   * @apiSuccess (Success 200) -
   */
  app.post('/api/renew', promiseHandler(withAuth(async req => {
    validateInput(req.body, Joi.object().keys({ email: emailSchema }))
    const { email } = req.body
    await firestore.doc(`users/${email}`).update({ renewedAt: new Date() })
    return new Response(200, {})
  })))

  /**
   * @api {post} /api/token Get service account access token
   * @apiName token
   * @apiVersion 1.0.0
   * @apiGroup Service accounts
   * @apiParam {String} email Service account email
   * @apiSuccess (Success 200) {String} accessToken Service account access token
   */
  app.post('/api/token', promiseHandler(withAuth(async req => {
    validateInput(req.body, Joi.object().keys({ email: emailSchema }))
    const { email } = req.body
    const { data: { accessToken } } = await iamcredentials.projects.serviceAccounts.generateAccessToken({
      name: `projects/-/serviceAccounts/${email}`,
      requestBody: { scope: ['profile', 'email', 'openid'] }
    })
    return new Response(200, { accessToken })
  })))

  app.post('/api/cleanup', promiseHandler(withAuth(async () => {
    const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60)
    const { docs } = await firestore.collection('users').where('renewedAt', '<', oneHourAgo).get()
    const results = await Promise.all(docs.map(async ({ id }) => {
      try {
        await deleteUser(id)
        return 'succeeded'
      } catch (error) {
        console.error(error)
        return 'failed'
      }
    }))
    return new Response(200, _.countBy(_.identity, results))
  })))

  app.listen(process.env.PORT || 8080)
}

main().catch(console.error)
